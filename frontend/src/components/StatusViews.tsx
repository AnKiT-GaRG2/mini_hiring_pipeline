import type { ReactNode } from 'react'
import { Button } from './Button'

export function BoardSkeleton() {
  return (
    <div role="status" aria-label="Loading candidates" className="flex gap-4 overflow-hidden xl:grid xl:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="w-72 shrink-0 space-y-3 rounded-xl bg-slate-100/70 p-3 xl:w-auto">
          <div className="h-5 w-24 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
          {Array.from({ length: i % 3 === 0 ? 2 : 1 }, (_, j) => (
            <div key={j} className="h-28 animate-pulse rounded-lg bg-white motion-reduce:animate-none" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Couldn’t load candidates</h2>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      <Button variant="primary" className="mt-5" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
