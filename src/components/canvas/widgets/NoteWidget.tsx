import { StickyNote } from 'lucide-react'
import { registerWidget } from '../widget-registry'
import type { WidgetProps } from '../widget-types'

function NoteWidget({ config, setConfig, canvas }: WidgetProps) {
  const text = typeof config.text === 'string' ? config.text : ''
  return (
    <textarea
      value={text}
      readOnly={canvas.readOnly}
      onChange={(e) => setConfig({ ...config, text: e.target.value })}
      placeholder={canvas.readOnly ? '' : 'Jot something down…'}
      className="canvas-no-drag w-full h-full resize-none bg-transparent text-sm leading-6 outline-none"
    />
  )
}

registerWidget({
  type: 'note',
  name: 'Note',
  icon: StickyNote,
  defaultSize: { w: 3, h: 3, minW: 2, minH: 2 },
  defaultConfig: { text: '' },
  component: NoteWidget,
})
