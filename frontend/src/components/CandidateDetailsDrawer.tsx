import { useMemo } from 'react'
import { buildTimeline, describeCurrentStage, formatEventDate } from '../domain/history'
import { useCandidateDetails } from '../hooks/useCandidateDetails'
import { Button } from './Button'
import { HistoryTimeline } from './HistoryTimeline'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { StageBadge } from './StageBadge'

type Props = {
  candidateId: string
  now: number
  onClose: () => void
}

/**
 * Candidate details and audit trail. Read-only by construction: the only
 * controls are Close and (after a failed load) Try again.
 */
export function CandidateDetailsDrawer({ candidateId, now, onClose }: Props) {
  const { state, retry } = useCandidateDetails(candidateId)

  const timeline = useMemo(
    () => (state.status === 'ready' ? buildTimeline(state.candidate, state.history) : []),
    [state],
  )

  const title = state.status === 'ready' ? state.candidate.name : 'Candidate details'

  return (
    <Modal title={title} variant="drawer" onClose={onClose}>
      {state.status === 'loading' && (
        <div role="status" className="mt-8 flex items-center gap-3 text-sm text-slate-500">
          <Spinner /> Loading candidate…
        </div>
      )}

      {state.status === 'error' && (
        <div role="alert" className="mt-6 rounded-lg bg-rose-50 p-4 text-sm text-rose-900">
          <p>{state.message}</p>
          <Button variant="primary" size="sm" className="mt-3" onClick={retry}>
            Try again
          </Button>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <p className="mt-4 rounded-lg bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-900">
            {describeCurrentStage(state.candidate, state.history, now)}
          </p>

          <dl className="mt-5 grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-slate-500">Email</dt>
            <dd className="min-w-0 break-words">
              <a className="text-indigo-700 hover:underline" href={`mailto:${state.candidate.email}`}>
                {state.candidate.email}
              </a>
            </dd>

            <dt className="text-slate-500">Phone</dt>
            <dd>{state.candidate.phone ?? <span className="text-slate-400">Not provided</span>}</dd>

            <dt className="text-slate-500">Current stage</dt>
            <dd>
              <StageBadge stage={state.candidate.currentStage} />
            </dd>

            <dt className="text-slate-500">Date added</dt>
            <dd>{formatEventDate(state.candidate.createdAt, now)}</dd>
          </dl>

          <h3 className="mt-8 mb-4 text-sm font-semibold text-slate-900">History</h3>
          <HistoryTimeline entries={timeline} now={now} />
          {state.history.length === 0 && (
            <p className="mt-4 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">
              No stage changes yet.
            </p>
          )}
        </>
      )}

      <div className="mt-8 flex justify-end">
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}
