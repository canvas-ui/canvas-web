import { ArrowLeft } from 'lucide-react'
import { useMenu } from '@/components/shell/use-menu'

export function MenuBackButton() {
  const { goBack } = useMenu()
  return <button type="button" onClick={goBack} aria-label="Back to previous view" title="Back to previous view"
    className="-ml-2 mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent md:hidden">
    <ArrowLeft className="h-5 w-5" />
  </button>
}
