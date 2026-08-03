/**
 * Generates src/theme/css/fallback.css — an sRGB mirror of every OKLCH token.
 *
 * Why this exists
 * ---------------
 * The theme is authored entirely in OKLCH, which needs Chromium 111+ /
 * Safari 15.4+. Tailwind v4 deliberately does not downlevel below that. Canvas
 * ships as an Android PWA, and a meaningful slice of that audience is on
 * Huawei devices — either an older forked Chromium in Huawei Browser, or
 * HarmonyOS NEXT's ArkWeb engine, which is not Chromium at all. On those, every
 * colour token resolves to nothing and the app renders effectively unstyled.
 *
 * Why not the usual two-declaration trick
 * ---------------------------------------
 * The classic fallback pattern:
 *
 *     color: #fff;
 *     color: oklch(1 0 0);
 *
 * does NOT work for custom properties. A custom property accepts *any* valid
 * token sequence, so an old browser happily stores `oklch(1 0 0)` as the value
 * and only discovers it is meaningless at `var()` substitution time — which
 * makes the property invalid-at-computed-value-time and resolves it to unset,
 * NOT to the earlier declaration. The earlier declaration is already gone.
 *
 * So the whole block has to be skipped at parse time, which is what
 * `@supports not (color: oklch(0 0 0))` does.
 *
 * Regenerate with `npm run build:fallbacks` after changing any theme file.
 * The output is committed so the normal build stays a single Vite pass.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CSS_DIR = path.join(ROOT, 'src/theme/css')
const OUT = path.join(CSS_DIR, 'fallback.css')

// Files whose custom properties carry colour. Order matters only for resolving
// `var(--p-*)` references, so primitives must be read first.
const SOURCES = [
  'primitives.css',
  'base.css',
  'themes/canvas.css',
  'themes/nord.css',
  'themes/contrast.css',
  'themes/terminal.css',
  'data-palette.css',
]

/* ── OKLCH -> sRGB ──────────────────────────────────────────────────────── */

/** OKLab -> linear sRGB (Björn Ottosson's matrices). */
function oklabToLinearSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

function gammaEncode(c) {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  // Clamping is a real approximation: OKLCH can express colours outside the
  // sRGB gamut. Those clip to the gamut boundary, which is exactly what an
  // old browser could have displayed anyway.
  return Math.min(255, Math.max(0, Math.round(v * 255)))
}

function oklchToRgb(L, C, H) {
  const rad = (H * Math.PI) / 180
  const [lr, lg, lb] = oklabToLinearSrgb(L, C * Math.cos(rad), C * Math.sin(rad))
  return [gammaEncode(lr), gammaEncode(lg), gammaEncode(lb)]
}

function formatColor([r, g, b], alpha) {
  if (alpha != null && alpha < 1) return `rgba(${r}, ${g}, ${b}, ${alpha})`
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

/* ── Parsing ────────────────────────────────────────────────────────────── */

const NUM = String.raw`[-+]?[0-9]*\.?[0-9]+%?`

/** Parse `oklch(L C H)` / `oklch(L C H / A)`. Returns null if not that shape. */
function parseAbsoluteOklch(value) {
  const m = value
    .trim()
    .match(new RegExp(String.raw`^oklch\(\s*(${NUM})\s+(${NUM})\s+(${NUM})\s*(?:\/\s*(${NUM})\s*)?\)$`, 'i'))
  if (!m) return null
  const num = (raw) => (raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw))
  return {
    L: num(m[1]),
    C: num(m[2]),
    H: parseFloat(m[3]),
    alpha: m[4] == null ? 1 : num(m[4]),
  }
}

/**
 * Parse relative colour syntax: `oklch(from <base> L C h)`.
 *
 * Only the shapes this codebase actually uses are supported — literal L and C
 * with the base's hue passed through as `h`. Anything else throws rather than
 * being silently mis-converted, so a new pattern fails the build loudly.
 */
function parseRelativeOklch(value, resolve) {
  const m = value
    .trim()
    .match(new RegExp(String.raw`^oklch\(\s*from\s+(.+?)\s+(${NUM})\s+(${NUM})\s+([a-z]+|${NUM})\s*(?:\/\s*(${NUM})\s*)?\)$`, 'i'))
  if (!m) return null

  const base = resolve(m[1].trim())
  if (!base) throw new Error(`cannot resolve base colour of: ${value}`)

  const num = (raw) => (raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw))
  const hueToken = m[4]
  const H = /^[a-z]+$/i.test(hueToken)
    ? hueToken.toLowerCase() === 'h'
      ? base.H
      : (() => {
          throw new Error(`unsupported relative-colour channel "${hueToken}" in: ${value}`)
        })()
    : parseFloat(hueToken)

  return { L: num(m[2]), C: num(m[3]), H, alpha: m[5] == null ? base.alpha : num(m[5]) }
}

/** All `--name: value` declarations, grouped by the selector they sit under. */
function parseBlocks(css) {
  const blocks = []
  // Strip comments first so a `{` inside prose can't break block matching.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(clean))) {
    const selector = m[1].trim().replace(/\s+/g, ' ')
    // @theme/@media/@keyframes wrappers are not colour sources.
    if (selector.startsWith('@')) continue
    const decls = []
    for (const line of m[2].split(';')) {
      const i = line.indexOf(':')
      if (i === -1) continue
      const prop = line.slice(0, i).trim()
      const value = line.slice(i + 1).trim()
      if (prop.startsWith('--') && value) decls.push([prop, value])
    }
    if (decls.length) blocks.push({ selector, decls })
  }
  return blocks
}

/* ── Build ──────────────────────────────────────────────────────────────── */

// Primitives resolve first so themes can reference them by var().
const primitives = new Map()
const allBlocks = []

for (const file of SOURCES) {
  const css = fs.readFileSync(path.join(CSS_DIR, file), 'utf8')
  for (const block of parseBlocks(css)) {
    allBlocks.push({ file, ...block })
    for (const [prop, value] of block.decls) {
      if (prop.startsWith('--p-')) {
        const parsed = parseAbsoluteOklch(value)
        if (parsed) primitives.set(prop, parsed)
      }
    }
  }
}

/** Resolve a value expression to {L,C,H,alpha}, or null if it isn't a colour. */
function resolve(value, seen = new Set()) {
  const v = value.trim()

  const varMatch = v.match(/^var\(\s*(--[\w-]+)\s*\)$/)
  if (varMatch) {
    const name = varMatch[1]
    if (seen.has(name)) return null // guard against a cyclic definition
    seen.add(name)
    if (primitives.has(name)) return primitives.get(name)
    // Non-primitive var() references are left alone: the fallback block
    // redefines those tokens too, so the reference still resolves at runtime.
    return null
  }

  if (/^oklch\(\s*from\s/i.test(v)) return parseRelativeOklch(v, (base) => resolve(base, seen))
  return parseAbsoluteOklch(v)
}

const out = []
let converted = 0
let passthrough = 0

for (const { file, selector, decls } of allBlocks) {
  const lines = []
  for (const [prop, value] of decls) {
    // Numeric knobs (--data-l, --data-c, --shadow-strength) and non-colour
    // tokens are irrelevant to the fallback and must not be emitted, or they
    // would shadow later overrides for no reason.
    if (!/oklch\(/i.test(value) && !/^var\(\s*--p-/.test(value)) continue

    let resolved
    try {
      resolved = resolve(value)
    } catch (error) {
      console.error(`  ! ${file} ${prop}: ${error.message}`)
      process.exitCode = 1
      continue
    }

    if (!resolved) {
      passthrough++
      continue
    }
    lines.push(`    ${prop}: ${formatColor(oklchToRgb(resolved.L, resolved.C, resolved.H), resolved.alpha)};`)
    converted++
  }
  if (lines.length) out.push(`  ${selector} {\n${lines.join('\n')}\n  }`)
}

const header = `/**
 * GENERATED FILE — do not edit.
 * Run \`npm run build:fallbacks\` after changing any theme file.
 *
 * sRGB mirror of every OKLCH colour token, for engines without OKLCH support
 * (Chromium < 111, Safari < 15.4, HarmonyOS ArkWeb). See
 * scripts/generate-color-fallbacks.mjs for why this cannot be done with the
 * usual two-declaration fallback pattern.
 *
 * \`@supports not (...)\` is evaluated at parse time, so supporting browsers
 * skip this block entirely and pay only the transfer cost.
 */

@supports not (color: oklch(0 0 0)) {
${out.join('\n\n')}

  /* Elevation is rebuilt from a plain rgba shadow: the OKLCH ladder is
     composed with relative colour syntax, which is even less supported than
     oklch() itself. Values approximate the same visual weight. */
  :root {
    --shadow-elevation-0: none;
    --shadow-elevation-1: 0 1px 2px -1px rgba(0, 0, 0, 0.12), 0 1px 3px 0 rgba(0, 0, 0, 0.08);
    --shadow-elevation-2: 0 2px 4px -2px rgba(0, 0, 0, 0.12), 0 4px 6px -1px rgba(0, 0, 0, 0.08);
    --shadow-elevation-3: 0 4px 6px -4px rgba(0, 0, 0, 0.12), 0 10px 15px -3px rgba(0, 0, 0, 0.08);
    --shadow-elevation-4: 0 8px 10px -6px rgba(0, 0, 0, 0.12), 0 20px 25px -5px rgba(0, 0, 0, 0.08);
    --shadow-elevation-5: 0 16px 20px -8px rgba(0, 0, 0, 0.16), 0 32px 48px -12px rgba(0, 0, 0, 0.12);
  }

  [data-scheme='dark'] {
    --shadow-elevation-1: 0 1px 2px -1px rgba(0, 0, 0, 0.5), 0 1px 3px 0 rgba(0, 0, 0, 0.35);
    --shadow-elevation-2: 0 2px 4px -2px rgba(0, 0, 0, 0.5), 0 4px 6px -1px rgba(0, 0, 0, 0.35);
    --shadow-elevation-3: 0 4px 6px -4px rgba(0, 0, 0, 0.5), 0 10px 15px -3px rgba(0, 0, 0, 0.35);
    --shadow-elevation-4: 0 8px 10px -6px rgba(0, 0, 0, 0.5), 0 20px 25px -5px rgba(0, 0, 0, 0.35);
    --shadow-elevation-5: 0 16px 20px -8px rgba(0, 0, 0, 0.55), 0 32px 48px -12px rgba(0, 0, 0, 0.45);
  }
}
`

fs.writeFileSync(OUT, header)
console.log(`wrote ${path.relative(ROOT, OUT)}`)
console.log(`  ${converted} tokens converted, ${passthrough} left to runtime var() resolution`)
