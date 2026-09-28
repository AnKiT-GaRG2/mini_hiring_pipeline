import type { Candidate } from '../api/types'
import { countLabel, describeFilters, describeMatch, extraParseDetail, isNameOnly } from '../domain/searchSummary'
import type { SearchOutcome } from '../hooks/usePipeline'
import { Button } from './Button'
import type { CardHandlers } from './cardHandlers'
import { CandidateCard } from './CandidateCard'
import { SearchHelp } from './SearchHelp'
import { SlowSearchNotice } from './SlowSearchNotice'
import { Spinner } from './Spinner'

type Props = CardHandlers & {
  outcome: SearchOutcome | null
  pendingSearch: { query: string; startedAt: number } | null
  /** Matching candidates, in the server's relevance order. */
  candidates: Candidate[]
  onShowAll: () => void
  onRetry: (query: string) => void
}

function SearchingStatus({ query, startedAt }: { query: string; startedAt: number }) {
  return (
    <div className="mb-4 space-y-1">
      <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
        <Spinner className="h-4 w-4" /> Searching for “{query}”…
      </p>
      <SlowSearchNotice startedAt={startedAt} />
    </div>
  )
}

function ResultsSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-lg border border-slate-200 bg-white motion-reduce:animate-none" />
      ))}
    </div>
  )
}

function FilterList({ labels }: { labels: string[] }) {
  if (labels.length === 0) return <p className="mt-1 text-sm text-slate-500">No filter — everyone.</p>
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-500">{labels.length === 1 ? 'Filter:' : 'Filters:'}</span>
      <ul aria-label="Search filters" className="flex flex-wrap gap-2">
        {labels.map((label) => (
          <li
            key={label}
            className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800 ring-1 ring-inset ring-indigo-200"
          >
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The search view: a ranked list with the filters that were applied and, for
 * name matches, why each one matched. It also owns every "nothing to show"
 * situation so each says what happened and what to do next.
 */
export function SearchResults({ outcome, pendingSearch, candidates, onShowAll, onRetry, ...handlers }: Props) {
  const searching = pendingSearch !== null
  const status = pendingSearch && <SearchingStatus query={pendingSearch.query} startedAt={pendingSearch.startedAt} />

  if (!outcome) {
    return (
      <section aria-label="Search results" aria-busy="true">
        {status}
        <ResultsSkeleton />
      </section>
    )
  }

  if (outcome.kind === 'unparsed') {
    return (
      <section aria-label="Search results" aria-busy={searching}>
        {status}
        <SearchHelp detail={extraParseDetail(outcome.message)} onShowAll={onShowAll} />
      </section>
    )
  }

  if (outcome.kind === 'error') {
    return (
      <section aria-label="Search results" aria-busy={searching}>
        {status}
        <div role="alert" className="mx-auto max-w-xl rounded-xl border border-rose-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold text-slate-900">Search isn’t working right now</h2>
          <p className="mt-2 text-sm text-slate-600">{outcome.message}</p>
          <div className="mt-6 flex gap-2">
            <Button variant="primary" onClick={() => onRetry(outcome.query)}>
              Try again
            </Button>
            <Button onClick={onShowAll}>Show all candidates</Button>
          </div>
        </div>
      </section>
    )
  }

  const { parsed, matches } = outcome
  const now = handlers.now

  if (candidates.length === 0) {
    // A name was all we understood and nobody has it — most likely the query isn't
    // a name at all (e.g. "purple elephants"), so explain what can be searched.
    if (isNameOnly(parsed)) {
      return (
        <section aria-label="Search results" aria-busy={searching}>
          {status}
          <SearchHelp lookedForName={parsed.name?.query} onShowAll={onShowAll} />
        </section>
      )
    }
    return (
      <section aria-label="Search results" aria-busy={searching}>
        {status}
        <div role="status" className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold text-slate-900">No candidates found</h2>
          <p className="mt-2 text-sm text-slate-600">I understood your search, but nobody matches all of it.</p>
          <FilterList labels={describeFilters(parsed, now)} />
          <p className="mt-3 text-sm text-slate-600">Try removing one of these conditions.</p>
          <Button className="mt-6" onClick={onShowAll}>
            Show all candidates
          </Button>
        </div>
      </section>
    )
  }

  // Only name searches have a relevance score; other results are simply in pipeline order.
  const ranked = candidates.some((c) => matches[c.id]?.score != null)

  return (
    <section aria-label="Search results" aria-busy={searching}>
      {status}
      <div className={searching ? 'opacity-60 transition-opacity' : ''}>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div role="status">
            <h2 className="text-lg font-semibold text-slate-900">{countLabel(candidates.length)}</h2>
            <FilterList labels={describeFilters(parsed, now)} />
          </div>
          <Button variant="ghost" size="sm" onClick={onShowAll}>
            Show all candidates
          </Button>
        </div>

        <ol
          aria-label={ranked ? 'Results, best match first' : 'Results'}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {candidates.map((c, index) => {
            const match = matches[c.id]
            return (
              <li key={c.id}>
                <CandidateCard
                  candidate={c}
                  pending={handlers.pending[c.id]}
                  now={handlers.now}
                  rank={ranked ? index + 1 : undefined}
                  matchNote={match?.matchType && parsed.name ? describeMatch(match.matchType, parsed.name.query) : undefined}
                  onMove={handlers.onMove}
                  onReject={handlers.onReject}
                  onOpen={handlers.onOpen}
                />
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
