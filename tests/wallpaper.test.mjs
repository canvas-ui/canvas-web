import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as wallpapers from '@augmentd-labs/canvas-wallpapers'

const KEY = 'canvas:wallpaper'
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const gifUrl = `data:image/gif;base64,${gif.toString('base64')}`
const source = ts.transpileModule(readFileSync(new URL('../src/lib/wallpaper.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

// Transaction-shaped storage double: put succeeds before commit, and an
// aborted transaction never changes persisted data. Reloads get fresh module
// state while keeping the same database, as a real page reload would.
function harness({ db = { value: undefined, failWrites: false }, legacy, failRead = false } = {}) {
  const local = new Map(legacy ? [[KEY, JSON.stringify(legacy)]] : [])
  const css = new Map()
  const objectUrls = new Map()
  const revokedUrls = []
  let nextObjectUrl = 0
  const exports = {}
  vm.runInNewContext(source, {
    exports,
    require: name => { assert.equal(name, '@augmentd-labs/canvas-wallpapers'); return wallpapers },
    localStorage: { getItem: key => local.get(key), removeItem: key => local.delete(key), setItem: () => assert.fail('No new images should use localStorage') },
    document: { documentElement: { style: { setProperty: (key, value) => css.set(key, value), removeProperty: key => css.delete(key) } } },
    Blob, atob, TextEncoder,
    URL: {
      createObjectURL: blob => {
        const url = `blob:wallpaper-test/${++nextObjectUrl}`
        objectUrls.set(url, blob)
        return url
      },
      revokeObjectURL: url => {
        assert.notEqual(css.get('--wallpaper-image'), `url("${url}")`, 'replace the CSS before revoking its image')
        objectUrls.delete(url)
        revokedUrls.push(url)
      },
    },
    indexedDB: { open: () => {
      const request = { result: {
        close() {},
        transaction: (_store, mode) => {
          const tx = { objectStore: () => ({
            get: () => {
              const read = { result: structuredClone(db.value) }
              queueMicrotask(() => {
                if (failRead) { tx.error = new Error('read failed'); tx.onerror() }
                else tx.oncomplete()
              })
              return read
            },
            put: (value, key) => {
              assert.equal(mode, 'readwrite')
              const write = { result: key }
              queueMicrotask(() => {
                if (db.failWrites) { tx.error = new Error('quota exceeded'); tx.onabort() }
                else { db.value = structuredClone(value); tx.oncomplete() }
              })
              return write
            },
          }) }
          return tx
        },
      } }
      queueMicrotask(() => request.onsuccess())
      return request
    } },
    FileReader: class {
      readAsDataURL(blob) {
        blob.arrayBuffer().then(bytes => {
          this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`
          this.onload()
        })
      }
    },
  })
  return { api: exports, db, css, local, objectUrls, revokedUrls }
}

test('legacy wallpaper is migrated intact and restores after reloading', async () => {
  const legacy = { image: gifUrl, fit: 'center' }
  const first = harness({ legacy })
  assert.equal(first.api.loadWallpaper().image, gifUrl)
  await first.api.restoreWallpaper()
  assert.equal(JSON.stringify(first.db.value), JSON.stringify(legacy))
  assert.equal(first.local.has(KEY), false)
  assert.match(first.css.get('--wallpaper-image'), /^url\("blob:/)
  assert.deepEqual(Buffer.from(await [...first.objectUrls.values()][0].arrayBuffer()), gif)
  const reloaded = harness({ db: first.db })
  await reloaded.api.restoreWallpaper()
  assert.equal(reloaded.api.loadWallpaper().image, gifUrl)
  assert.equal(reloaded.css.get('--wallpaper-size'), 'auto')
})

test('failed migration retains the legacy image; failed saves retain the applied wallpaper', async () => {
  const legacy = { image: gifUrl, fit: 'cover' }
  const session = harness({ legacy, db: { value: undefined, failWrites: true } })
  await session.api.restoreWallpaper()
  assert.equal(session.local.has(KEY), true)
  assert.equal(session.api.loadWallpaper().image, gifUrl)
  await assert.rejects(session.api.saveWallpaper({ image: null, fit: 'fill' }), /quota exceeded/)
  assert.equal(session.api.loadWallpaper().image, gifUrl)
  assert.match(session.css.get('--wallpaper-image'), /^url\("blob:/)
})

test('10 MB limit measures file bytes, keeps GIF data unchanged, and rejects larger files', async () => {
  const { api, db, css, objectUrls } = harness()
  const bytes = Buffer.alloc(10 * 1024 * 1024)
  gif.copy(bytes)
  const dataUrl = await api.readWallpaperFile(new File([bytes], 'animated.gif', { type: 'image/gif' }))
  assert.ok(dataUrl.length > api.WALLPAPER_MAX_BYTES, 'base64 expansion must not count toward the file limit')
  assert.deepEqual(Buffer.from(dataUrl.split(',')[1], 'base64'), bytes)
  await api.saveWallpaper({ image: dataUrl, fit: 'fill' })
  assert.ok(css.get('--wallpaper-image').length < 512, 'large uploads must not exceed the browser CSS variable limit')
  const blob = [...objectUrls.values()][0]
  assert.equal(blob.type, 'image/gif')
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()), bytes)
  const reloaded = harness({ db })
  await reloaded.api.restoreWallpaper()
  assert.equal(reloaded.api.loadWallpaper().image, dataUrl)
  assert.match(reloaded.css.get('--wallpaper-image'), /^url\("blob:/, 'reload rebuilds the runtime URL from the persisted data')
  assert.equal(reloaded.css.get('--wallpaper-size'), '100% 100%')
  await assert.rejects(api.readWallpaperFile(new File([Buffer.alloc(api.WALLPAPER_MAX_BYTES + 1)], 'large.gif', { type: 'image/gif' })), /up to 10 MB/)
  assert.equal(await api.readWallpaperFile(new File([gif], 'animation.GIF')), gifUrl, 'GIF extension works when the browser omits its MIME type')
  await assert.rejects(api.readWallpaperFile(new File(['hello'], 'notes.txt', { type: 'text/plain' })), /image file/)
})

test('built-in selection, fit changes, and removal persist in the new store', async () => {
  const session = harness({ legacy: { image: gifUrl, fit: 'cover' } })
  const image = session.api.builtinRef(wallpapers.wallpapers[0].id)
  await session.api.saveWallpaper({ image, fit: 'fill' })
  assert.ok(session.css.get('--wallpaper-image').includes('/wallpapers/'))
  const reloaded = harness({ db: session.db })
  await reloaded.api.restoreWallpaper()
  assert.equal(reloaded.api.loadWallpaper().image, image)
  await reloaded.api.saveWallpaper({ image: null, fit: 'cover' })
  assert.equal(reloaded.css.has('--wallpaper-image'), false)
  assert.equal(reloaded.css.has('--wallpaper-size'), false)
  assert.equal(session.db.value.image, null)
})

test('fit changes reuse the GIF URL; replacement and removal release previous images', async () => {
  const session = harness()
  await session.api.saveWallpaper({ image: gifUrl, fit: 'cover' })
  const first = session.css.get('--wallpaper-image')
  await session.api.saveWallpaper({ image: gifUrl, fit: 'center' })
  assert.equal(session.css.get('--wallpaper-image'), first)
  assert.equal(session.objectUrls.size, 1)
  assert.equal(session.revokedUrls.length, 0)
  const other = `data:image/gif;base64,${Buffer.concat([gif, Buffer.from([0])]).toString('base64')}`
  await session.api.saveWallpaper({ image: other, fit: 'cover' })
  assert.notEqual(session.css.get('--wallpaper-image'), first)
  assert.equal(session.objectUrls.size, 1)
  assert.equal(session.revokedUrls.length, 1)
  await session.api.saveWallpaper({ image: session.api.builtinRef(wallpapers.wallpapers[0].id), fit: 'cover' })
  assert.equal(session.objectUrls.size, 0)
  assert.equal(session.revokedUrls.length, 2)
  await session.api.saveWallpaper({ image: gifUrl, fit: 'fill' })
  await session.api.saveWallpaper({ image: null, fit: 'cover' })
  assert.equal(session.objectUrls.size, 0)
  assert.equal(session.revokedUrls.length, 3)
})

test('a malformed legacy image does not prevent startup', async () => {
  const session = harness({ legacy: { image: 'data:image/gif;base64,not base64!', fit: 'cover' } })
  await session.api.restoreWallpaper()
  assert.equal(session.css.has('--wallpaper-image'), false)
  assert.equal(session.objectUrls.size, 0)
})
