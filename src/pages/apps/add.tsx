import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { HomeFab } from '@/components/home/HomeFab'
import type { QuickAddKind } from '@/components/home/quick-add-types'

const KINDS: readonly QuickAddKind[] = ['note', 'todo', 'link', 'file', 'photo']

// Quick-add landing for PWA shortcuts - /apps/add/<kind> opens the matching
// B5 quick-add card immediately (same flow the share-target page uses). The
// card owns the whole add-then-link-to workflow: save somewhere sensible,
// or Link To… to pick where the item semantically belongs.
export default function QuickAddPage() {
  const { kind } = useParams()
  const navigate = useNavigate()

  if (!kind || !KINDS.includes(kind as QuickAddKind)) {
    return <Navigate to="/home" replace />
  }

  return (
    <HomeFab
      initialKind={kind as QuickAddKind}
      onInitialCardClose={() => navigate('/home')}
    />
  )
}
