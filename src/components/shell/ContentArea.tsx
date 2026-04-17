import { Outlet } from 'react-router-dom'

export function ContentArea() {
  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      <main className="flex-1 overflow-auto p-4">
        <Outlet />
      </main>
    </div>
  )
}
