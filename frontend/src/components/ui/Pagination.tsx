import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  noun: string
}

/** "Showing 1–5 of 5 jobs" and page buttons. Renders the count even when there's a single page. */
export function Pagination({ page, pageSize, total, onPage, noun }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(total, page * pageSize)

  // Always the first and last page, and the neighbours of the current one.
  const shown = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)

  const arrow = 'flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-500 hover:bg-tint disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-500">
      <p>
        Showing {first}–{last} of {total} {noun}
      </p>
      <nav aria-label="Pagination" className="flex items-center gap-1.5">
        <button type="button" className={arrow} aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        {shown.map((p, i) => (
          <span key={p} className="flex items-center gap-1.5">
            {i > 0 && p - shown[i - 1] > 1 && <span aria-hidden="true">…</span>}
            <button
              type="button"
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPage(p)}
              className={`h-8 min-w-8 rounded-lg border px-2 text-xs font-medium ${
                p === page ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-ink-600 hover:bg-tint'
              }`}
            >
              {p}
            </button>
          </span>
        ))}
        <button type="button" className={arrow} aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  )
}
