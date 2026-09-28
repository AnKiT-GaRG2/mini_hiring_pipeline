import type { Candidate } from '../api/types'
import type { PendingKind } from '../hooks/usePipeline'

/** Props every level of the board passes down to reach a candidate card. */
export type CardHandlers = {
  pending: Record<string, PendingKind>
  now: number
  onMove: (candidate: Candidate) => void
  onReject: (candidate: Candidate) => void
  onOpen: (candidate: Candidate) => void
}
