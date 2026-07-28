import { useLocation, useNavigate } from 'react-router-dom'
import { Key, Share2, Monitor, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const settingsLinks = [
  { path: '/api-tokens', icon: Key, label: 'API Tokens' },
  { path: '/devices', icon: Monitor, label: 'Devices' },
  { path: '/embedding', icon: Sparkles, label: 'Embedding' },
  { path: '/shared', icon: Share2, label: 'Shared With Me' },
]

export function SettingsMenu() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center px-4 h-12 border-b border-sidebar-border shrink-0">
        <span className="text-sm font-semibold">Settings</span>
      </div>

      {/* Links */}
      <div className="flex-1 overflow-y-auto py-2">
        <div className="space-y-1 px-2">
          {settingsLinks.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path

            return (
              <button
                key={path}
                type="button"
                onClick={() => navigate(path)}
                className={cn(
                  'flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md transition-colors',
                  isActive
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
