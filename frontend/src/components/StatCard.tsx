import type { ReactNode } from 'react'
import { Card } from './ui/Card'

type Props = {
  label: string
  value: ReactNode
  /** The icon, already coloured; it sits in a tinted circle. */
  icon: ReactNode
  tile: string
  /** The line under the number, e.g. a change and what it is measured against. */
  caption?: ReactNode
}

/** A plain figure card, as across the top of the Jobs and Manage Teams pages. */
export function StatCard({ label, value, icon, tile, caption }: Props) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${tile}`}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-ink-500">{label}</p>
        <div className="mt-0.5 text-[26px] leading-none font-bold tracking-tight text-ink-950">{value}</div>
        {caption && <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-500">{caption}</p>}
      </div>
    </Card>
  )
}
