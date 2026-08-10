import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { registerWidget } from '../widget-registry'
import type { WidgetProps } from '../widget-types'

export function ClockWidget({ config, setConfig, canvas }: WidgetProps) {
  const [now, setNow] = useState(() => new Date())
  const hour12 = config.format !== '24'

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center h-full gap-1">
      <div className="text-3xl font-semibold tabular-nums">
        {now.toLocaleTimeString(undefined, { hour12, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div className="text-xs text-muted-foreground">
        {now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
      </div>
      {!canvas.readOnly && (
        <button
          type="button"
          onClick={() => setConfig({ ...config, format: hour12 ? '24' : '12' })}
          className="mt-1 px-2 py-0.5 text-[10px] border rounded-md text-muted-foreground hover:bg-accent"
        >
          {hour12 ? '12h' : '24h'}
        </button>
      )}
    </div>
  )
}

registerWidget({
  type: 'clock',
  name: 'Clock',
  icon: Clock,
  defaultSize: { w: 3, h: 2, minW: 2, minH: 2 },
  defaultConfig: { format: '24' },
  component: ClockWidget,
})
