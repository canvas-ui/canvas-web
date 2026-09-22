import { useNavigate } from 'react-router-dom'

/** Every personal settings page has a route back to the searchable overview. */
export function useSettingsMenuBack(): () => void {
  const navigate = useNavigate()
  return () => navigate('/settings')
}
