import { jwtDecode } from 'jwt-decode'

export interface LocalNotification {
  id: string
  title: string
  text: string
  timestamp: string
  status: 'info' | 'started' | 'completed' | 'error'
}

const DB_NAME = 'canvas-notifications'
const STORE = 'notifications'
const EVENT = 'canvas:notification-history'
let database: Promise<IDBDatabase> | undefined
let channel: BroadcastChannel | undefined

/** Stable across token renewals; accounts on this browser keep separate histories. */
export function notificationAccount(): string {
  try {
    const token = localStorage.getItem('authToken')
    if (token) {
      const claims = jwtDecode<Record<string, unknown>>(token)
      const id = claims.sub || claims.userId || claims.id || claims.email
      if (typeof id === 'string' || typeof id === 'number') return JSON.stringify([claims.iss || '', id])
    }
  } catch { /* The login screen has a separate local history. */ }
  return 'anonymous'
}

function openDatabase(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: ['account', 'id'] })
        store.createIndex('account', 'account')
      }
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => { db.close(); database = undefined }
        resolve(db)
      }
      request.onerror = () => reject(request.error)
    }).catch(error => { database = undefined; throw error })
  }
  return database
}

type HistoryChange = { account: string; error?: boolean }
function broadcastChannel() {
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(EVENT)
    channel.onmessage = event => window.dispatchEvent(new CustomEvent(EVENT, { detail: event.data }))
  }
  return channel
}
function changed(account: string, error = false) {
  const detail: HistoryChange = { account, error }
  window.dispatchEvent(new CustomEvent(EVENT, { detail }))
  if (!error) broadcastChannel()?.postMessage(detail)
}
export function subscribeNotificationHistory(account: string, listener: (error: boolean) => void) {
  broadcastChannel()
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<HistoryChange>).detail
    if (detail?.account === account) listener(!!detail.error)
  }
  window.addEventListener(EVENT, handle)
  return () => window.removeEventListener(EVENT, handle)
}

export async function listLocalNotifications(account: string): Promise<LocalNotification[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).index('account').getAll(account)
    tx.oncomplete = () => resolve((request.result as LocalNotification[]).sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)))
    tx.onabort = () => reject(tx.error)
    tx.onerror = () => reject(tx.error)
  })
}

async function mutate(account: string, action: (store: IDBObjectStore) => void) {
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error)
      tx.onerror = () => reject(tx.error)
      action(tx.objectStore(STORE))
    })
    changed(account)
  } catch (error) {
    changed(account, true)
    throw error
  }
}

/** One record per delivery, even when the same socket event reaches multiple tabs. */
export function addLocalNotification(account: string, item: LocalNotification) {
  return mutate(account, store => {
    const existing = store.get([account, item.id])
    existing.onsuccess = () => { if (!existing.result) store.put({ ...item, account }) }
  })
}

/** Update a progress entry in place. Clearing it must not resurrect it on completion. */
export function updateLocalNotification(account: string, id: string, patch: Partial<Pick<LocalNotification, 'title' | 'text' | 'status'>>) {
  return mutate(account, store => {
    const existing = store.get([account, id])
    existing.onsuccess = () => { if (existing.result) store.put({ ...existing.result, ...patch }) }
  })
}

export function removeLocalNotification(account: string, id: string) {
  return mutate(account, store => { store.delete([account, id]) })
}

export function clearLocalNotifications(account: string) {
  return mutate(account, store => {
    const cursor = store.index('account').openKeyCursor(account)
    cursor.onsuccess = () => {
      if (!cursor.result) return
      store.delete(cursor.result.primaryKey)
      cursor.result.continue()
    }
  })
}
