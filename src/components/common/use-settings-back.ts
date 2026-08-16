import { useIsMobile } from '@/hooks/use-mobile'
import { useMenu } from '@/components/shell/use-menu'

/**
 * Back step for the flat settings pages (Appearance, API tokens, Devices, …):
 * they are reached from the Settings menu drawer, which closes on navigation
 * on mobile — Back reopens it. On desktop the menu stays beside the content,
 * so there is no back step (returns undefined → PageHeader hides the arrow).
 */
export function useSettingsMenuBack(): (() => void) | undefined {
  const isMobile = useIsMobile()
  const { openM1Drawer } = useMenu()
  return isMobile ? () => openM1Drawer('settings') : undefined
}
