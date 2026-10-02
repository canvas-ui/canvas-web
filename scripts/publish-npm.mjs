#!/usr/bin/env node
// Publishes the prebuilt web UI to npm as @augmentd-labs/canvas-web — the
// package canvas-server serves the UI from. Skips when npm already has this
// version, so it is safe on every push to main (release.yml); a release
// is a version bump (`pnpm run release patch`).
//
// The published package is dist/ plus a minimal manifest: vite already bundled
// every runtime dependency, so it has none. `canvasRev` records the commit.
//
// Usage (build first: `pnpm run build`):
//   node scripts/publish-npm.mjs [--dry-run] [--out artifacts]
// Prints `published=<version>` (or `published=`) for the workflow. Leaves the
// packed tarball in <out> for the GitHub Release.
// Auth: CI uses npm trusted publishing (OIDC, provenance attached); a local
// run uses whatever token your npm config has.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? resolve(args[outIdx + 1]) : join(root, 'artifacts');

if (!existsSync(join(root, 'dist', 'index.html'))) {
    console.error(`No build at ${join(root, 'dist')} — run \`pnpm run build\` first`);
    process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const spec = `${pkg.name}@${pkg.version}`;
try {
    const have = execFileSync('npm', ['view', spec, 'version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (have === pkg.version) {
        console.log(`${spec}: already on npm — skipping`);
        console.log('published=');
        process.exit(0);
    }
} catch { /* E404: not published yet */ }

let rev = 'unknown';
try { rev = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }

const stage = join(out, 'stage');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(join(root, 'dist'), join(stage, 'dist'), { recursive: true });
for (const f of ['LICENSE', 'NOTICE', 'README.md']) {
    if (existsSync(join(root, f))) cpSync(join(root, f), join(stage, f));
}
writeFileSync(join(stage, 'package.json'), JSON.stringify({
    name: pkg.name,
    version: pkg.version,
    description: `${pkg.description} (prebuilt dist)`,
    license: pkg.license,
    author: pkg.author,
    repository: pkg.repository,
    files: ['dist', 'NOTICE'],
    canvasRev: rev,
}, null, 2) + '\n');

execFileSync('npm', ['pack', '--pack-destination', out], { cwd: stage, stdio: ['ignore', 'ignore', 'inherit'] });
const cmd = ['publish', '--access', 'public'];
if (process.env.GITHUB_ACTIONS === 'true') cmd.push('--provenance');
if (dryRun) cmd.push('--dry-run');
console.log(`${spec} (${rev}): npm ${cmd.join(' ')}`);
// From inside the staged dir — npm resolves package files against the cwd.
execFileSync('npm', cmd, { cwd: stage, stdio: 'inherit' });
rmSync(stage, { recursive: true, force: true });
console.log(`published=${dryRun ? '' : pkg.version}`);
