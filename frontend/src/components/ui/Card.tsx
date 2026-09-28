import type { HTMLAttributes, ReactNode } from 'react'

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={`rounded-2xl border border-line bg-white shadow-card ${className}`} {...rest} />
}

/** Title (with an optional leading icon tile) on the left, an optional link/action on the right. */
export function CardHeader({
  icon,
  title,
  subtitle,
  action,
  className = '',
}: {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-ink-950">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}
