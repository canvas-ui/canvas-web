import { PageHeader } from '@/components/common/page-header'
import { useSettingsMenuBack } from '@/components/common/use-settings-back'
import { OfflineSettings } from '@/components/settings/offline-settings'

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        className="mb-6"
        title="Offline"
        onBack={useSettingsMenuBack()}
        description="Per-device offline cache: browse notes, files, photos and saved websites without a connection."
      />
      <OfflineSettings />
    </div>
  )
}
