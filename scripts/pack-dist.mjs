#!/usr/bin/env node
// Stages the prebuilt web UI as a dependency-free package — the artifact
// canvas-server installs straight from git:
//
//   "canvas-web": "github:canvas-ui/canvas-web#web-dist"
//
// vite already bundled every runtime dependency, so the artifact is dist/ plus
// a minimal manifest (no dependencies). `canvasRev` records the source commit;
// scripts/release.sh --if-needed compares against it.
//
// Usage (build first: `pnpm run build`):
//   node scripts/pack-dist.mjs [--out artifacts] [--pack]
// Output: <out>/dist/web/ (ready to commit as the web-dist branch);
// --pack also writes <out>/canvas-web-<version>.tgz for the GitHub Release.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? resolve(args[outIdx + 1]) : join(root, 'artifacts');

if (!existsSync(join(root, 'dist', 'index.html'))) {
    console.error(`No build at ${join(root, 'dist')} — run \`pnpm run build\` first`);
    process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
let rev = 'unknown';
try { rev = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }

const stage = join(out, 'dist', 'web');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(join(root, 'dist'), join(stage, 'dist'), { recursive: true });
for (const f of ['LICENSE', 'NOTICE', 'README.md']) {
    if (existsSync(join(root, f))) cpSync(join(root, f), join(stage, f));
}
const manifest = {
    name: pkg.name,
    version: pkg.version,
    description: `${pkg.description || 'Canvas web UI'} (prebuilt dist artifact)`,
    license: pkg.license,
    repository: pkg.repository,
    files: ['dist', 'NOTICE'],
    canvasRev: rev,
};
writeFileSync(join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`web: ${manifest.name}@${manifest.version} (${rev}) → ${stage}`);

if (args.includes('--pack')) {
    execFileSync('npm', ['pack', '--pack-destination', out], { cwd: stage, stdio: ['ignore', 'ignore', 'inherit'] });
    console.log(`  packed ${join(out, `${manifest.name}-${manifest.version}.tgz`)}`);
}
