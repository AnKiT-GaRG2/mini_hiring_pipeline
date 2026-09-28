import { useMemo } from 'react'
import type { Candidate, Stage } from '../api/types'
import { PIPELINE_STAGES } from '../domain/stages'
import type { CardHandlers } from './cardHandlers'
import { CandidateCard } from './CandidateCard'
import { StageColumn } from './StageColumn'

type Props = CardHandlers & {
  candidates: Candidate[]
}

function groupByStage(candidates: Candidate[]): Record<Stage, Candidate[]> {
  const groups: Record<Stage, Candidate[]> = {
    APPLIED: [],
    SCREENING: [],
    INTERVIEW: [],
    OFFER: [],
    HIRED: [],
    REJECTED: [],
  }
  for (const c of candidates) groups[c.currentStage].push(c)

  // Longest-waiting first, so anyone stuck sits at the top of their column.
  for (const stage of PIPELINE_STAGES) {
    groups[stage].sort((a, b) => a.currentStageSince.localeCompare(b.currentStageSince))
  }
  // Most recently rejected first.
  groups.REJECTED.sort((a, b) => b.currentStageSince.localeCompare(a.currentStageSince))
  return groups
}

export function PipelineBoard({ candidates, ...handlers }: Props) {
  const groups = useMemo(() => groupByStage(candidates), [candidates])

  return (
    <div className="space-y-8">
      <div
        role="group"
        aria-label="Hiring pipeline"
        className="flex snap-x gap-4 overflow-x-auto pb-2 xl:grid xl:grid-cols-5 xl:overflow-visible"
      >
        {PIPELINE_STAGES.map((stage) => (
          <StageColumn key={stage} stage={stage} candidates={groups[stage]} emptyText="No candidates" {...handlers} />
        ))}
      </div>

      <section aria-labelledby="rejected-heading">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" aria-hidden="true" />
          <h2 id="rejected-heading" className="text-sm font-semibold text-slate-800">
            Rejected
          </h2>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
            {groups.REJECTED.length}
          </span>
        </div>
        {groups.REJECTED.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
            No rejected candidates.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {groups.REJECTED.map((c) => (
              <li key={c.id}>
                <CandidateCard
                  candidate={c}
                  pending={handlers.pending[c.id]}
                  now={handlers.now}
                  onMove={handlers.onMove}
                  onReject={handlers.onReject}
                  onOpen={handlers.onOpen}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
