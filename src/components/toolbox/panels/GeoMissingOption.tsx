import { useToolbox } from '../use-toolbox'

export function GeoMissingOption() {
  const { state, setFilters } = useToolbox()
  return <label className="flex items-center gap-2 text-xs text-muted-foreground">
    <input type="checkbox" checked={state.filters.geo.includeUnlocated ?? false} onChange={event => setFilters({
      ...state.filters, geo: { ...state.filters.geo, includeUnlocated: event.target.checked },
    })} />
    Include documents without a location
  </label>
}
