import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function WorkspacesPage() {
  const token = localStorage.getItem('token');

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 border rounded">
              <h3 className="font-mono">Your JWT Token:</h3>
              <p className="text-sm break-all mt-2">{token}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}