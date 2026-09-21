import { useSyncExternalStore } from 'react'
import { isOffline, onConnectivityChange } from '@/lib/connectivity'

export function useOfflineStatus() {
  return useSyncExternalStore(onConnectivityChange, isOffline, () => false)
}
