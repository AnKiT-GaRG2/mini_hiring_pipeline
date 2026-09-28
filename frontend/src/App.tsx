import { useState } from 'react'
import type { Candidate } from './api/types'
import { errorMessage, isStaleStateError } from './api/http'
import { AddCandidateModal } from './components/AddCandidateModal'
import { CandidateDetailsDrawer } from './components/CandidateDetailsDrawer'
import { ConfirmRejectDialog } from './components/ConfirmRejectDialog'
import { Button } from './components/Button'
import { Header } from './components/Header'
import { PipelineBoard } from './components/PipelineBoard'
import { SearchResults } from './components/SearchResults'
import { BoardSkeleton, EmptyState, ErrorState } from './components/StatusViews'
import { ToastProvider } from './components/ToastProvider'
import { STAGE_LABELS } from './domain/stages'
import { useNow } from './hooks/useNow'
import { usePipeline } from './hooks/usePipeline'
import { useSearchInput } from './hooks/useSearchInput'
import { useToast } from './hooks/useToast'

const REFRESH_NOTE = ' The board has been refreshed.'

function PipelineApp() {
  const pipeline = usePipeline()
  const toast = useToast()
  const now = useNow(30_000)

  const [adding, setAdding] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<Candidate | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const search = useSearchInput({ runSearch: pipeline.runSearch, clearSearch: pipeline.clearSearch })
  const searchActive = pipeline.outcome !== null || pipeline.searching

  function failureMessage(action: string, name: string, err: unknown) {
    return `Couldn’t ${action} ${name}: ${errorMessage(err)}${isStaleStateError(err) ? REFRESH_NOTE : ''}`
  }

  async function handleMove(candidate: Candidate) {
    try {
      const updated = await pipeline.moveToNext(candidate)
      if (updated) toast.success(`Moved ${updated.name} to ${STAGE_LABELS[updated.currentStage]}.`)
    } catch (err) {
      toast.error(failureMessage('move', candidate.name, err))
    }
  }

  async function handleConfirmReject() {
    const candidate = rejectTarget
    if (!candidate) return
    try {
      const updated = await pipeline.reject(candidate)
      if (updated) toast.success(`Rejected ${updated.name}.`)
    } catch (err) {
      toast.error(failureMessage('reject', candidate.name, err))
    } finally {
      setRejectTarget(null)
    }
  }

  function renderMain() {
    // Search has its own endpoint, so it works even if the board itself failed to load.
    if (searchActive) {
      return (
        <SearchResults
          outcome={pipeline.outcome}
          pendingSearch={pipeline.pendingSearch}
          candidates={pipeline.visible}
          pending={pipeline.pending}
          now={now}
          onMove={(c) => void handleMove(c)}
          onReject={setRejectTarget}
          onOpen={(c) => setOpenId(c.id)}
          onShowAll={search.onClear}
          onRetry={(query) => search.onSubmit(query)}
        />
      )
    }
    if (pipeline.loadState.status === 'loading') return <BoardSkeleton />
    if (pipeline.loadState.status === 'error') {
      return <ErrorState message={pipeline.loadState.message} onRetry={() => void pipeline.reload()} />
    }
    if (pipeline.candidates.length === 0) {
      return (
        <EmptyState
          title="No candidates yet"
          description="Add your first candidate and they’ll appear in the Applied column."
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              + Add candidate
            </Button>
          }
        />
      )
    }

    return (
      <PipelineBoard
        candidates={pipeline.candidates}
        pending={pipeline.pending}
        now={now}
        onMove={(c) => void handleMove(c)}
        onReject={setRejectTarget}
        onOpen={(c) => setOpenId(c.id)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header
        searchText={search.text}
        onSearchTextChange={search.onChange}
        onSearch={search.onSubmit}
        onClearSearch={search.onClear}
        searching={pipeline.searching}
        onAddCandidate={() => setAdding(true)}
      />

      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">{renderMain()}</main>

      {adding && (
        <AddCandidateModal
          onClose={() => setAdding(false)}
          onSubmit={async (input) => {
            const created = await pipeline.addCandidate(input)
            toast.success(`Added ${created.name} to Applied.`)
            setAdding(false)
          }}
        />
      )}

      {rejectTarget && (
        <ConfirmRejectDialog
          candidate={rejectTarget}
          busy={pipeline.pending[rejectTarget.id] === 'rejecting'}
          onConfirm={() => void handleConfirmReject()}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      {openId && <CandidateDetailsDrawer candidateId={openId} now={now} onClose={() => setOpenId(null)} />}
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <PipelineApp />
    </ToastProvider>
  )
}
