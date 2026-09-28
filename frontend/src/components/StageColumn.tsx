import type { Candidate, Stage } from '../api/types'
import { STAGE_LABELS, STAGE_STYLES } from '../domain/stages'
import type { CardHandlers } from './cardHandlers'
import { CandidateCard } from './CandidateCard'

type Props = CardHandlers & {
  stage: Stage
  candidates: Candidate[]
  emptyText: string
}

export function StageColumn({ stage, candidates, emptyText, pending, now, onMove, onReject, onOpen }: Props) {
  const headingId = `column-${stage}`
  return (
    <section
      aria-labelledby={headingId}
      className="w-72 shrink-0 snap-start rounded-xl bg-slate-100/70 p-3 xl:w-auto"
    >
      <header className="mb-3 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${STAGE_STYLES[stage].dot}`} aria-hidden="true" />
        <h2 id={headingId} className="text-sm font-semibold text-slate-800">
          {STAGE_LABELS[stage]}
        </h2>
        <span
          className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200"
          aria-label={`${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`}
        >
          {candidates.length}
        </span>
      </header>

      {candidates.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
          {emptyText}
        </p>
      ) : (
        <ul className="space-y-3">
          {candidates.map((c) => (
            <li key={c.id}>
              <CandidateCard
                candidate={c}
                pending={pending[c.id]}
                now={now}
                onMove={onMove}
                onReject={onReject}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
