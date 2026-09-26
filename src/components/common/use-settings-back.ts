import { useMenu } from '@/components/shell/use-menu'

/** Return to the settings navigation without replacing the current page. */
export function useSettingsMenuBack(): () => void {
  const { openM1Drawer } = useMenu()
  return () => openM1Drawer('settings')
}
