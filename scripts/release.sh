#!/usr/bin/env bash
# release.sh — publish canvas-web.
#
#   pnpm run release dist                 build + force-push the web-dist branch
#   pnpm run release dist --if-needed     ...only if non-docs commits landed since
#                                         the published canvasRev (dist.yml uses this)
#   pnpm run release tag                  tag v<version> + push → release.yml attaches
#                                         the tarball to a GitHub Release
#   pnpm run release tag --bump patch     bump package.json first (committed)
#   any                  --dry-run        print the plan, change nothing
#
# canvas-server pins "canvas-web": "github:canvas-ui/canvas-web#web-dist" and
# picks a push up on its next `npm update canvas-web`; v* tags are the
# immutable pins. CI never bumps versions or writes to main.
set -euo pipefail

say() { echo "[release $(date '+%H:%M:%S')] $1"; }
die() { echo "[release] ERROR: $1" >&2; exit 1; }

MODE="${1:-}"; shift || true
[[ "$MODE" == "dist" || "$MODE" == "tag" ]] || die "usage: release.sh dist|tag [--if-needed] [--bump patch|minor|major] [--dry-run]"
BUMP=""; IF_NEEDED=false; DRY_RUN=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --bump) BUMP="${2:-}"; shift 2 ;;
        --if-needed) IF_NEEDED=true; shift ;;
        --dry-run) DRY_RUN=true; shift ;;
        *) die "unknown argument '$1'" ;;
    esac
done

cd "$(git rev-parse --show-toplevel)"
[[ "$(git branch --show-current)" == "main" ]] || die "releases publish from main only"
git update-index -q --refresh >/dev/null 2>&1 || true
git diff-index --quiet HEAD -- || $DRY_RUN || die "working tree has uncommitted changes"
git fetch origin main --tags --quiet || die "git fetch failed"
if ! git merge-base --is-ancestor origin/main main; then
    [[ "${GITHUB_ACTIONS:-}" == "true" ]] && { say "origin/main moved past this run — superseded, exiting"; exit 0; }
    die "main is behind/diverged from origin/main — pull/rebase first"
fi

if ! git config user.email >/dev/null 2>&1; then
    export GIT_AUTHOR_NAME="github-actions[bot]" GIT_AUTHOR_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"
    export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
fi

if [[ -n "$BUMP" ]]; then
    [[ "$BUMP" =~ ^(patch|minor|major)$ ]] || die "--bump must be patch, minor or major"
    if $DRY_RUN; then say "--dry-run: would bump $BUMP"; else
        npm version "$BUMP" --no-git-tag-version >/dev/null
        git commit --quiet -am "canvas-web $(node -p "require('./package.json').version")"
        say "Bumped to $(node -p "require('./package.json').version") (committed)"
    fi
fi
ver=$(node -p "require('./package.json').version")
rev=$(git rev-parse --short HEAD)

if [[ "$MODE" == "tag" ]]; then
    tag="v$ver"
    git rev-parse -q --verify "refs/tags/$tag" >/dev/null && die "tag $tag already exists — bump first (--bump patch)"
    $DRY_RUN && { say "--dry-run: would push main and tag $tag"; exit 0; }
    git push origin main
    git tag "$tag" && git push origin "$tag"
    say "Done: $tag pushed — release.yml is building. Watch: gh run list --workflow=release.yml --limit 1"
    exit 0
fi

# ── dist: stage + force-push the web-dist branch ─────────────────────────────
if $IF_NEEDED; then
    git fetch origin web-dist --quiet 2>/dev/null || true
    published=$({ git show origin/web-dist:package.json 2>/dev/null || true; } | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).canvasRev||'')}catch{}})")
    if [[ -n "$published" ]] && git rev-parse -q --verify "${published}^{commit}" >/dev/null; then
        n=$(git log --oneline "$published..HEAD" -- . ':(exclude)*.md' ':(exclude).github' | wc -l)
        [[ "$n" -eq 0 ]] && { say "--if-needed: web-dist already at $published, nothing shippable moved — skipping"; exit 0; }
        say "--if-needed: $n commit(s) since web-dist@$published — republishing"
    fi
fi
$DRY_RUN && { say "--dry-run: would build and publish web-dist $ver ($rev)"; exit 0; }
[[ -n "$BUMP" ]] && git push origin main

say "Installing + building $ver..."
corepack pnpm install --frozen-lockfile >/dev/null || die "pnpm install failed"
corepack pnpm run build >/dev/null || die "build failed"

out=$(mktemp -d); trap 'rm -rf "$out"' EXIT
node scripts/pack-dist.mjs --out "$out" >/dev/null || die "pack-dist failed"
stage="$out/dist/web"
origin_url=$(git remote get-url origin)
if [[ -n "${GITHUB_TOKEN:-}" && "$origin_url" == https://github.com/* ]]; then
    origin_url="https://x-access-token:${GITHUB_TOKEN}@github.com/${origin_url#https://github.com/}"
fi
(
    cd "$stage" && git init --quiet -b web-dist && git add -A -f &&
    git -c user.name="release:web" -c user.email="release@canvas" commit --quiet -m "canvas-web $ver (main@$rev)"
) || die "failed to assemble the web-dist commit"
sha=$(git -C "$stage" rev-parse HEAD)
git -C "$stage" push --quiet --force "$origin_url" web-dist || die "push of web-dist failed"
[[ "$(git ls-remote "$origin_url" refs/heads/web-dist | cut -f1)" == "$sha" ]] || die "verification failed: remote web-dist != $sha"
say "Done: canvas-web $ver (main@$rev) → web-dist $sha"
