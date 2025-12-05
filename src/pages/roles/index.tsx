export default function RolesPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">Roles</h1>
        <p className="text-muted-foreground mt-2">Manage user roles and permissions</p>
      </div>

      {/* Coming Soon Section */}
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Coming Soon</h2>
          <p className="text-muted-foreground max-w-md">
            Role management functionality is currently under development. Check back later for updates.
          </p>
        </div>
      </div>
    </div>
  )
}
