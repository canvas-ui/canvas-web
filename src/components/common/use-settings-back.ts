import { useMenu } from '@/components/shell/use-menu'

/** Retrace the settings views, including their mobile menu steps. */
export function useSettingsMenuBack(): () => void {
  const { goBack } = useMenu()
  return goBack
}
