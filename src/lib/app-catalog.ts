export const APP_CATEGORIES = [
  { id: 'productivity', label: 'Productivity' },
  { id: 'creative', label: 'Creative' },
  { id: 'media', label: 'Media & capture' },
  { id: 'utilities', label: 'Utilities' },
] as const
export type AppCategory = typeof APP_CATEGORIES[number]['id']

/** Serializable metadata; the host owns launch behavior, including native app IDs. */
export interface AppCatalogEntry {
  id: string
  name: string
  description: string
  category: AppCategory
  kind: 'canvas' | 'web' | 'desktop'
  target: string
}

export function groupApps(apps: AppCatalogEntry[], query: string) {
  const search = query.trim().toLocaleLowerCase()
  return APP_CATEGORIES.map(category => ({ ...category, apps: apps
    .filter(app => app.category === category.id && `${app.name} ${app.description} ${app.kind} ${category.label}`.toLocaleLowerCase().includes(search))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
  })).filter(category => category.apps.length)
}

export function webAppUrl(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter an HTTP or HTTPS URL without embedded credentials.')
  return url.href
}
