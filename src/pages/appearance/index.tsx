import { PageHeader } from '@/components/common/page-header'
import { AppearanceSettings } from '@/components/settings/appearance-settings'

export default function AppearancePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        className="mb-6"
        title="Appearance"
        description="Theme, colour scheme and density. Changes apply immediately and are remembered on this device."
      />
      <AppearanceSettings />
    </div>
  )
}
