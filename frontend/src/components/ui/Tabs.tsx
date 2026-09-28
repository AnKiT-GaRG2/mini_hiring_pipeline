import type { ReactNode } from 'react'

export type TabItem<T extends string> = { id: T; label: string; count?: number }

type Props<T extends string> = {
  tabs: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  'aria-label': string
  className?: string
  right?: ReactNode
}

/** Underlined tabs with optional count pills, as on the Jobs and Candidates pages. */
export function Tabs<T extends string>({ tabs, value, onChange, right, className = '', ...rest }: Props<T>) {
  return (
    <div className={`flex items-center justify-between gap-4 border-b border-line ${className}`}>
      <div role="tablist" aria-label={rest['aria-label']} className="scrollbar-thin -mb-px flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.id === value
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                active ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none font-semibold ${active ? 'bg-brand-50 text-brand-700' : 'bg-tint text-ink-500'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {right}
    </div>
  )
}
