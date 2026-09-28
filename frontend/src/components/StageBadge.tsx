import type { Stage } from '../api/types'
import { STAGE_LABELS, STAGE_STYLES } from '../domain/stages'

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STAGE_STYLES[stage].badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STAGE_STYLES[stage].dot}`} aria-hidden="true" />
      {STAGE_LABELS[stage]}
    </span>
  )
}
