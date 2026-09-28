import type { Candidate } from '../api/types'
import type { PendingKind } from '../hooks/usePipeline'
import { canReject, formatTimeInStage, nextStage, STAGE_LABELS } from '../domain/stages'
import { Button } from './Button'
import { StageBadge } from './StageBadge'

type Props = {
  candidate: Candidate
  pending?: PendingKind
  now: number
  /** Position in a ranked list of search results. */
  rank?: number
  /** Why this card is here, e.g. "Fuzzy name match". */
  matchNote?: string
  onMove: (candidate: Candidate) => void
  onReject: (candidate: Candidate) => void
  onOpen: (candidate: Candidate) => void
}

export function CandidateCard({ candidate, pending, now, rank, matchNote, onMove, onReject, onOpen }: Props) {
  const next = nextStage(candidate.currentStage)
  const busy = pending !== undefined

  return (
    <article
      aria-label={candidate.name}
      aria-busy={busy || undefined}
      className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-opacity ${busy ? 'opacity-75' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {rank !== undefined && (
            <span
              className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 px-1 text-xs font-semibold text-slate-600"
              aria-label={`Result ${rank}`}
            >
              {rank}
            </span>
          )}
          <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900">{candidate.name}</h3>
        </div>
        <StageBadge stage={candidate.currentStage} />
      </div>
      <p className="truncate text-sm text-slate-500" title={candidate.email}>
        {candidate.email}
      </p>
      {matchNote && <p className="mt-1 text-xs font-medium text-indigo-700">{matchNote}</p>}

      <p className="mt-2 text-xs text-slate-500">
        In stage for{' '}
        <span className="font-medium text-slate-700">{formatTimeInStage(candidate.currentStageSince, now)}</span>
      </p>

      <div className="mt-3 space-y-2">
        {next && (
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            loading={pending === 'moving'}
            loadingLabel="Moving…"
            disabled={busy}
            onClick={() => onMove(candidate)}
          >
            Move to {STAGE_LABELS[next]}
          </Button>
        )}
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="-ml-2" disabled={busy} onClick={() => onOpen(candidate)}>
            Open
          </Button>
          {canReject(candidate.currentStage) && (
            <Button variant="danger" size="sm" disabled={busy} onClick={() => onReject(candidate)}>
              Reject
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
