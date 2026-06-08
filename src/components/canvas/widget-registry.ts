import type { WidgetDef } from './widget-types'

// Extensibility seam: a flat type -> definition map. Widget modules register
// themselves on import; CanvasGrid imports ./widgets to pull them in.
const registry = new Map<string, WidgetDef>()

export function registerWidget(def: WidgetDef): void {
  registry.set(def.type, def)
}

export function getWidget(type: string): WidgetDef | undefined {
  return registry.get(type)
}

export function listWidgets(): WidgetDef[] {
  return [...registry.values()]
}
