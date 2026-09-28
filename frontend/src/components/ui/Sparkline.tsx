import { useId } from 'react'

type Props = {
  values: number[]
  /** Stroke colour; the fill beneath is a fading tint of it. */
  color: string
  width?: number
  height?: number
  className?: string
}

/** A smooth trend line with a soft fill. Decorative: the number beside it carries the meaning. */
export function Sparkline({ values, color, width = 140, height = 44, className = '' }: Props) {
  const gradientId = useId()
  const pad = 3
  const points = values.length >= 2 ? values : [0, 0]
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const xs = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2)
  // A flat series sits mid-height rather than on the floor.
  const ys = (v: number) => (max === min ? height / 2 : height - pad - ((v - min) / span) * (height - pad * 2))

  const coords = points.map((v, i) => [xs(i), ys(v)] as const)
  let line = `M${coords[0][0]},${coords[0][1]}`
  for (let i = 0; i < coords.length - 1; i++) {
    const [x0, y0] = coords[i]
    const [x1, y1] = coords[i + 1]
    const mx = (x0 + x1) / 2
    line += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`
  }
  const area = `${line} L${coords.at(-1)![0]},${height} L${coords[0][0]},${height} Z`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
