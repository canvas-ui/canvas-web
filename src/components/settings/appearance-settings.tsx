import { useState } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadWallpaper, saveWallpaper, WALLPAPER_FIT_OPTIONS, WALLPAPER_MAX_BYTES, type WallpaperSettings } from '@/lib/wallpaper'
import {
  DENSITY_OPTIONS,
  SCHEME_OPTIONS,
  THEMES,
  useTheme,
  type SchemePreference,
} from '@/theme'

const SCHEME_ICONS: Record<SchemePreference, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

/**
 * Appearance settings.
 *
 * Built entirely from the theme registry, so it can never offer a theme the
 * CSS doesn't implement. Adding a theme makes it appear here automatically.
 */
export function AppearanceSettings() {
  const { theme, scheme, density, resolvedScheme, setTheme, setScheme, setDensity, reset } =
    useTheme()

  return (
    <div className="space-y-8">
      <section>
        <SectionHeading
          title="Theme"
          description="Palette, shape and typography. Each theme defines its own light and dark variants."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEMES.map((entry) => {
            const isActive = entry.id === theme
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTheme(entry.id)}
                aria-pressed={isActive}
                className={cn(
                  'focus-ring group flex flex-col gap-3 rounded-lg border p-4 text-left transition-colors',
                  isActive
                    ? 'border-primary bg-accent'
                    : 'border-border hover:border-muted-foreground/40 hover:bg-accent/50',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{entry.name}</span>
                  {isActive && <Check className="size-4 shrink-0 text-primary" />}
                </div>
                <div className="flex gap-1.5" aria-hidden>
                  {entry.swatches.map((swatch) => (
                    <span
                      key={swatch}
                      className="size-6 rounded-full border border-border"
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">{entry.description}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <SectionHeading
          title="Colour scheme"
          description={
            scheme === 'system'
              ? `Following your system setting, currently ${resolvedScheme}.`
              : 'Overrides your system setting.'
          }
        />
        <SegmentedControl
          options={SCHEME_OPTIONS.map((option) => {
            const Icon = SCHEME_ICONS[option.id]
            return {
              id: option.id,
              label: option.name,
              icon: <Icon className="size-4 shrink-0" />,
            }
          })}
          value={scheme}
          onChange={setScheme}
        />
      </section>

      <section>
        <SectionHeading
          title="Density"
          description="Controls row height, hit-target size and shell spacing across the whole app."
        />
        <SegmentedControl
          options={DENSITY_OPTIONS.map((option) => ({
            id: option.id,
            label: option.name,
            title: option.description,
          }))}
          value={density}
          onChange={setDensity}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {DENSITY_OPTIONS.find((option) => option.id === density)?.description}
        </p>
      </section>

      <WallpaperSection />

      <section>
        <button
          type="button"
          onClick={reset}
          className="focus-ring rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Reset to defaults
        </button>
      </section>
    </div>
  )
}

// ── Wallpaper ────────────────────────────────────────────────────────────────
// Global desk background image (local-only preference, stored as a data URL
// in localStorage — see lib/wallpaper.ts). No image = the theme's desk color.
function WallpaperSection() {
  const [settings, setSettings] = useState(loadWallpaper)
  const [error, setError] = useState<string | null>(null)

  const update = (next: WallpaperSettings) => {
    try {
      saveWallpaper(next)
      setSettings(next)
      setError(null)
    } catch {
      setError('Could not store the wallpaper (browser storage full?). Try a smaller image.')
    }
  }

  const onPick = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Pick an image file.'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      if (dataUrl.length > WALLPAPER_MAX_BYTES) {
        setError('Image too large for browser storage. Use one under ~2.5 MB.')
        return
      }
      update({ ...settings, image: dataUrl })
    }
    reader.readAsDataURL(file)
  }

  return (
    <section>
      <SectionHeading
        title="Wallpaper"
        description="Background image for the desk behind all panels. Without one, the theme's desk color shows (the default)."
      />
      <div className="flex flex-wrap items-center gap-3">
        {/* Live thumbnail of the current desk look */}
        <div
          className="h-20 w-32 shrink-0 rounded-md border surface-desk"
          style={settings.image ? {
            backgroundImage: `url("${settings.image}")`,
            backgroundSize: settings.fit === 'fill' ? '100% 100%' : settings.fit === 'center' ? 'auto' : 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          } : undefined}
          aria-hidden
        />
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <label className="focus-ring inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent/50">
              {settings.image ? 'Change image…' : 'Choose image…'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = '' }}
              />
            </label>
            {settings.image && (
              <button
                type="button"
                onClick={() => update({ ...settings, image: null })}
                className="focus-ring rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                Remove
              </button>
            )}
          </div>
          <SegmentedControl
            options={WALLPAPER_FIT_OPTIONS.map((option) => ({ id: option.id, label: option.label, title: option.description }))}
            value={settings.fit}
            onChange={(fit) => update({ ...settings, fit })}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </section>
  )
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

interface SegmentedOption<T extends string> {
  id: T
  label: string
  icon?: React.ReactNode
  title?: string
}

/**
 * A radio group styled as a segmented control.
 *
 * `role="radiogroup"` rather than a row of buttons: these are mutually
 * exclusive choices, and screen readers should announce "2 of 4", not four
 * unrelated buttons.
 */
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {options.map((option) => {
        const isActive = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={option.title}
            onClick={() => onChange(option.id)}
            className={cn(
              'focus-ring flex h-control items-center gap-2 rounded-md px-3 text-sm transition-colors',
              isActive
                ? 'bg-card text-foreground shadow-elevation-1'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
