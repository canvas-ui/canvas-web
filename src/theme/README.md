# Canvas theme system

Self-contained design-token layer. No imports from the rest of the app, so it
can be consumed as-is by another host (Tauri, a browser extension, Storybook).

## The three axes

Themes are three independent settings, all written to `<html>` as data
attributes and all selectable at runtime:

| Attribute       | Values                                        | What it controls                          |
| --------------- | --------------------------------------------- | ----------------------------------------- |
| `data-theme`    | `canvas` `nord` `contrast` `terminal`         | Palette, shape, typography, geometry      |
| `data-scheme`   | `light` `dark`                                | Which half of the active theme applies    |
| `data-density`  | `auto` `compact` `comfortable` `touch`        | Control heights, row heights, spacing     |

They compose: `terminal` + `dark` + `touch` is a valid, coherent result.

## Token tiers

```
primitives.css   Tier 1  raw OKLCH ramps + scale steps. No meaning. Never used by components.
base.css         Tier 2  :root defaults for every semantic token
themes/*.css     Tier 2  per-theme overrides of those defaults
semantic.css     Tier 2  @theme inline bridge -> Tailwind utilities
components.css   Tier 3  per-component knobs (--btn-*, --input-*, --card-*, …)
```

Components consume **Tier 2 and Tier 3 only**. Reaching for a Tier 1 primitive
(`--p-neutral-600`) in a component is a bug: it will not respond to a theme.

Separately, `data-palette.css` provides 12 **categorical** colours
(`--color-data-1` … `-12`) for "these are different things" — document types,
timeline series. Those are not status colours; a to-do is not `success`.

## Import order is load-bearing

Theme, density and `:root` selectors all have specificity (0,1,0), so **source
order alone decides the winner**. `css/index.css` establishes:

```
defaults (primitives, base, layout, components)
  -> themes        can override any default
  -> density       overrides themes; it is the user's explicit choice
  -> derived       semantic bridge, elevation, motion, layers, utilities
```

Reordering these breaks themes *silently* — tokens still resolve, they just
resolve to the loser's value. There is a check for this in the verification
section below.

## Runtime API

```tsx
import { ThemeProvider, useTheme } from '@/theme'

<ThemeProvider>{children}</ThemeProvider>

const { theme, scheme, density, resolvedScheme,
        setTheme, setScheme, setDensity, toggleScheme, reset } = useTheme()
```

Outside React (or from a Tauri host):

```ts
import { applyTheme, readStoredPreferences } from '@/theme'
applyTheme({ theme: 'nord', scheme: 'dark', density: 'comfortable' })
```

`ThemeProvider` accepts `storage` (any get/set/remove adapter — point it at a
Tauri store to share the choice with the native shell), `initial` (force a
theme, for tests or a host that owns the setting), and `persist`.

## Flash prevention

The inline script in `index.html` applies the stored attributes before first
paint. It is duplicated from this module deliberately: importing a module there
would make it async, which is the entire problem it solves. It only mirrors the
storage key, the attribute names and the valid-value lists.

If you add a theme, add its id to that script's `themes` array too, or users
with that theme stored will see one frame of `canvas` on load.

## Adding a theme

1. `css/themes/<id>.css` — override only what differs from `base.css`
2. `@import` it from `css/index.css`, in the themes block
3. add it to `THEMES` in `registry.ts` and to `ThemeId` in `types.ts`
4. add the id to the inline script in `index.html`

A theme may override anything in Tiers 2 and 3 — including geometry
(`--layout-*`), typography and component knobs. `terminal` exercises all of
those; `contrast` exercises the component tier (square corners, 2px borders,
no shadows, 3px focus rings).

## Conventions worth knowing

- `--input` is the **border** colour of form controls, not a fill. Setting it
  to a surface colour makes every input invisible.
- Every filled surface has a matching `-foreground`. Use `bg-info` with
  `text-info-foreground`, never with `text-white`.
- Status roles have a `-subtle` variant for tinted backgrounds; that is what
  replaced `bg-red-50`, which was invisible in a dark scheme.
- Elevation is a six-step ladder, `shadow-elevation-0` … `-5`, with defined
  meanings (see `elevation.css`). Do not use Tailwind's built-in `shadow-md`
  and friends — they are not themed, so they render black-on-black in dark.
- Stacking uses named layers (`z-drawer`, `z-modal`, `z-toast`), not integers.
  See `layers.css` for the ordering.
- Motion durations are tokens scaled by `--motion-scale`, which
  `prefers-reduced-motion` drives to zero. A component using a duration token
  is compliant for free.

## Verifying a change

There is no automated test suite in this repo yet. To check a theme change,
run the app and confirm across themes that:

- inputs and borders are visible in every theme × scheme combination
- `data-density=compact|touch` visibly changes row and control heights
- a theme's own `--layout-*` values apply when density is `auto`
- density overrides a theme's layout when set explicitly
- reloading with a non-default theme stored shows no flash of `canvas`
