import type { Interview } from '../api/types'
import { INTERVIEW_STYLES, INTERVIEW_TYPE_SHORT_LABELS, PLATFORM_ICONS } from '../domain/interviews'
import { formatTime } from '../domain/time'

type Props = {
  interview: Interview
  tz: string
  onClick: () => void
  /** Week/day grid renders it absolutely positioned and needs the raw style. */
  style?: React.CSSProperties
  compact?: boolean
}

// Below this, there's only room for the type line and the candidate's name —
// the time line would either get clipped or force the card to overflow its slot.
const MIN_HEIGHT_FOR_TIME = 40

/** One interview block, coloured by type, as used in the week/day grid and the "Today" list. */
export function InterviewEventCard({ interview, tz, onClick, style, compact }: Props) {
  const styles = INTERVIEW_STYLES[interview.type]
  const PlatformIcon = PLATFORM_ICONS[interview.platform]
  const done = interview.status === 'COMPLETED'
  const height = typeof style?.height === 'number' ? style.height : undefined
  const showTime = !compact && (height === undefined || height >= MIN_HEIGHT_FOR_TIME)

  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={`group flex flex-col overflow-hidden rounded-lg border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition-colors ${styles.card} ${done ? 'opacity-60' : ''} ${compact ? '' : 'absolute'}`}
    >
      <span className={`flex items-center gap-1 font-semibold ${styles.text}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`} aria-hidden="true" />
        <span className="truncate">{INTERVIEW_TYPE_SHORT_LABELS[interview.type]}</span>
        {!compact && <PlatformIcon className="ml-auto h-2.5 w-2.5 shrink-0 opacity-70" aria-hidden="true" />}
      </span>
      <span className="truncate text-ink-800">{interview.candidate.name}</span>
      {showTime && <span className="truncate text-ink-500">{formatTime(interview.startsAt, tz)}</span>}
    </button>
  )
}
