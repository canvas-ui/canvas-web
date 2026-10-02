import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

test('pack-only and dry-run validate packaging without querying published versions', { skip: process.platform === 'win32' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'canvas-web-pack-test-'))
  try {
    mkdirSync(join(root, 'scripts'))
    mkdirSync(join(root, 'dist'))
    mkdirSync(join(root, 'bin'))
    copyFileSync(new URL('../scripts/publish-npm.mjs', import.meta.url), join(root, 'scripts/publish-npm.mjs'))
    writeFileSync(join(root, 'dist/index.html'), '<html></html>')
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@test/web', version: '1.0.0' }))
    const log = join(root, 'npm.log')
    writeFileSync(join(root, 'bin/npm'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$PACK_TEST_LOG"\n', { mode: 0o755 })
    for (const flag of ['--pack-only', '--dry-run']) {
      writeFileSync(log, '')
      execFileSync(process.execPath, [join(root, 'scripts/publish-npm.mjs'), flag, '--out', join(root, 'out')], {
        env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, PACK_TEST_LOG: log },
        stdio: 'pipe',
      })
      const calls = readFileSync(log, 'utf8').trim().split('\n')
      assert.ok(calls[0].startsWith('pack --pack-destination '))
      assert.equal(calls.some(call => call.startsWith('view ')), false)
      if (flag === '--pack-only') assert.equal(calls.length, 1)
      else {
        assert.equal(calls.length, 2)
        assert.match(calls[1], /^publish .*--dry-run/)
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
