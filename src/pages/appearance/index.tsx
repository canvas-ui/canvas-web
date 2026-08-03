import { AppearanceSettings } from '@/components/settings/appearance-settings'

export default function AppearancePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1>Appearance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Theme, colour scheme and density. Changes apply immediately and are remembered on this
          device.
        </p>
      </header>
      <AppearanceSettings />
    </div>
  )
}
