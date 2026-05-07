import { Outlet } from 'react-router-dom'

export function ContentArea() {
  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-muted/20">
      <main className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
