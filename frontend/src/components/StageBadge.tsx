import type { Stage } from '../api/types'
import { STAGE_LABELS, STAGE_STYLES } from '../domain/stages'

export function StageBadge({ stage, className = '' }: { stage: Stage; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_STYLES[stage].badge} ${className}`}>
      {STAGE_LABELS[stage]}
    </span>
  )
}
