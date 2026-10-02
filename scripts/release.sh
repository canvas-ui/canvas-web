#!/usr/bin/env bash
# release.sh — cut a canvas-web release: bump, commit, push main.
#
#   pnpm run release patch|minor|major      bump package.json, commit, push
#   pnpm run release patch --dry-run        print the plan, change nothing
#
# Pushing the bumped version is the whole release: release.yml builds,
# publishes @augmentd-labs/canvas-web@<version> to npm and creates the
# v<version> tag + GitHub Release. canvas-server picks it up with
# `npm update @augmentd-labs/canvas-web`. CI never bumps versions.
set -euo pipefail

say() { echo "[release $(date '+%H:%M:%S')] $1"; }
die() { echo "[release] ERROR: $1" >&2; exit 1; }

BUMP="${1:-}"; DRY_RUN=false
[[ "$BUMP" =~ ^(patch|minor|major)$ ]] || die "usage: release.sh patch|minor|major [--dry-run]"
[[ "${2:-}" == "--dry-run" ]] && DRY_RUN=true

cd "$(git rev-parse --show-toplevel)"
[[ "$(git branch --show-current)" == "main" ]] || die "releases publish from main only"
git update-index -q --refresh >/dev/null 2>&1 || true
git diff-index --quiet HEAD -- || die "working tree has uncommitted changes"
git fetch origin main --quiet || die "git fetch failed"
git merge-base --is-ancestor origin/main main || die "main is behind/diverged from origin/main — pull first"

cur=$(node -p "require('./package.json').version")
if $DRY_RUN; then say "--dry-run: would bump $BUMP from $cur, commit and push main"; exit 0; fi
npm version "$BUMP" --no-git-tag-version >/dev/null
ver=$(node -p "require('./package.json').version")
git commit --quiet -am "canvas-web $ver"
git push --quiet origin main
say "Pushed canvas-web $ver — release.yml publishes it. Watch: gh run list --workflow=release.yml --limit 1"
