import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// A web application is a link with data.type = 'webapp', grouped by the optional
// data.category. Both are synapsd facets on data/schema/link (data/type/webapp,
// data/category/<category>), so "games linked here" is a feature query.
export const WEBAPP_TYPE = 'webapp'

const CATEGORY_SUGGESTIONS = ['Games', 'Productivity', 'Development', 'Communication', 'Media', 'Finance', 'Learning']

export function WebAppFields({ webapp, setWebapp, category, setCategory, idPrefix, alwaysShowCategory = false }: {
  webapp: boolean
  setWebapp: (v: boolean) => void
  category: string
  setCategory: (v: string) => void
  idPrefix: string
  // The add forms only create a link (rather than a tab) for web apps, so there
  // the category follows the toggle; an existing link can carry one either way.
  alwaysShowCategory?: boolean
}) {
  const listId = `${idPrefix}-category-list`
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={webapp}
          onChange={(e) => setWebapp(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        Web app
        <span className="text-xs text-muted-foreground">launchable application, listed under Apps</span>
      </label>

      {(webapp || alwaysShowCategory) && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-category`}>Category</Label>
          <Input
            id={`${idPrefix}-category`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Optional, e.g. Games"
            list={listId}
          />
          <datalist id={listId}>
            {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
      )}
    </div>
  )
}
