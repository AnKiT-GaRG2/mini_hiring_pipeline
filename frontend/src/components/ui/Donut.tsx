import type { ReactNode } from 'react'

export type DonutSegment = { label: string; value: number; color: string }

type Props = {
  segments: DonutSegment[]
  size?: number
  thickness?: number
  /** Shown in the hole, e.g. the total. */
  children?: ReactNode
  'aria-label'?: string
}

/** A ring split into proportional arcs. An all-zero chart draws an empty grey ring. */
export function Donut({ segments, size = 112, thickness = 14, children, 'aria-label': ariaLabel }: Props) {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 3 : 0

  let offset = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={ariaLabel}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-tint)" strokeWidth={thickness} />
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => {
              const length = (s.value / total) * circumference
              const dash = Math.max(0, length - gap)
              const circle = (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={thickness}
                  strokeLinecap="butt"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                />
              )
              offset += length
              return circle
            })}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  )
}
