import { Palette, Keyboard, HardDriveDownload, Key, Monitor, Sparkles, Share2, Info, Users, Shield, ScrollText } from 'lucide-react'

export const SETTINGS_GROUPS = [
  { id: 'device', label: 'This device', description: 'Personalize this browser and manage content available offline.', items: [
    { path: '/appearance', icon: Palette, label: 'Appearance', description: 'Choose the theme, layout, colours and display density.' },
    { path: '/key-bindings', icon: Keyboard, label: 'Keyboard shortcuts', description: 'View and customize shortcuts for navigation and actions.' },
    { path: '/offline', icon: HardDriveDownload, label: 'Offline & cache', description: 'Manage cached content and storage on this device.' },
  ] },
  { id: 'account', label: 'Your account', description: 'Manage your access and the defaults your workspaces inherit.', items: [
    { path: '/api-tokens', icon: Key, label: 'API access tokens', description: 'Create and revoke credentials for apps and integrations.' },
    { path: '/devices', icon: Monitor, label: 'Registered devices', description: 'Manage devices connected to your account.' },
    { path: '/embedding', icon: Sparkles, label: 'Search & AI defaults', description: 'Choose default embedding providers and models for your workspaces.' },
    { path: '/shared', icon: Share2, label: 'Shared with you', description: 'Find content other people have shared with your account.' },
  ] },
  { id: 'server', label: 'Server administration', description: 'Administrator controls for everyone using this Canvas server.', items: [
    { path: '/admin/users', icon: Users, label: 'Users', description: 'Manage accounts and server access.' },
    { path: '/admin/roles', icon: Shield, label: 'Roles & permissions', description: 'Manage reusable permissions across the server.' },
    { path: '/admin/embedding', icon: Sparkles, label: 'Server search & AI defaults', description: 'Set the embedding providers and models accounts inherit.' },
    { path: '/admin/logs', icon: ScrollText, label: 'Server logs', description: 'Inspect server activity and troubleshoot failures.' },
  ] },
  { id: 'information', label: 'Information', description: 'Information about your Canvas installation.', items: [
    { path: '/about', icon: Info, label: 'About Canvas', description: 'View versions and information about this installation.' },
  ] },
] as const

export const PERSONAL_SETTINGS_PATHS = ['/settings', ...SETTINGS_GROUPS.filter(group => group.id !== 'server').flatMap(group => group.items.map(item => item.path))]

export function matchesSettingsQuery(query: string, ...fields: string[]): boolean {
  const haystack = fields.join(' ').toLocaleLowerCase()
  return query.toLocaleLowerCase().trim().split(/\s+/).every(word => haystack.includes(word))
}
