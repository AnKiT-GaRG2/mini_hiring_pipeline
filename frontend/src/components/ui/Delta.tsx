import { ArrowDown, ArrowUp } from 'lucide-react'
import { formatPercent } from '../../domain/format'

type Props = {
  /** Percentage change, or null when there was nothing to compare against. */
  value: number | null
  /**
   * How to colour it. "direction" is green for up and red for down; "lowerIsBetter"
   * flips that, for figures like time-to-hire where a drop is good news.
   */
  tone?: 'direction' | 'lowerIsBetter'
  className?: string
}

export function Delta({ value, tone = 'direction', className = '' }: Props) {
  if (value === null) return <span className={`text-xs text-ink-400 ${className}`} title="Nothing to compare with yet">—</span>
  if (value === 0) return <span className={`text-xs font-medium text-ink-500 ${className}`}>0%</span>

  const up = value > 0
  const good = tone === 'direction' ? up : !up
  const Arrow = up ? ArrowUp : ArrowDown
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${good ? 'text-emerald-600' : 'text-rose-500'} ${className}`}>
      <Arrow className="h-3 w-3" aria-hidden="true" />
      <span aria-label={`${up ? 'up' : 'down'} ${formatPercent(value)}`}>{formatPercent(value)}</span>
    </span>
  )
}
