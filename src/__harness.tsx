import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ToastContainer } from '@/components/ui/toast-container'
import { DocumentList } from '@/components/common/document-list'
import type { Document } from '@/types/workspace'

const now = new Date().toISOString()
const docs = Array.from({ length: 6 }, (_, i) => ({
  id: 100 + i, schema: 'data/schema/note', data: { title: `Note ${i}`, content: `body ${i}` },
  metadata: {}, locations: [], checksumArray: [`sha256/${'a'.repeat(8)}${i}`], createdAt: now, updatedAt: now,
})) as unknown as Document[]

const log = (...a: unknown[]) => { (window as unknown as { __log: unknown[] }).__log.push(a) }
;(window as unknown as { __log: unknown[] }).__log = []

function Harness() {
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState({ sortBy: 'crud:created', order: 'desc' as const })
  return (
    <DocumentList
      documents={docs} isLoading={false} contextPath="/demo" workspaceId="demo" totalCount={6}
      viewMode="table" allowViewToggle
      currentPage={page} pageSize={50} onPageChange={setPage} onPageSizeChange={() => {}}
      serverSort={sort as never} onServerSortChange={(s) => setSort(s as never)}
      onCopyDocuments={(ids) => log('copy', ids)} onCutDocuments={(ids) => log('cut', ids)}
      onRemoveDocuments={(ids) => log('remove', ids)} onDeleteDocuments={(ids) => log('delete', ids)}
      onPasteDocuments={async (p, ids) => { log('paste', p, ids); return true }} pastedDocumentIds={[7, 8]}
      onImportDocuments={async () => true} onPurgeDocuments={() => log('purge')}
    />
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><ToastContainer><Harness /></ToastContainer></StrictMode>)
