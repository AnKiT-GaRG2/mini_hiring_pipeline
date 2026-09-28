import { Download, Plus, Search, SlidersHorizontal, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { exportCandidates, listCandidates, rejectCandidate, searchCandidates, transitionCandidate } from '../api/candidates'
import { errorMessage, isStaleStateError } from '../api/http'
import { listJobs } from '../api/jobs'
import { listTags } from '../api/candidates'
import type { Candidate, CandidateSort, ExperienceLevel, ParsedQuery, SearchResult, Stage, TagWithCount } from '../api/types'
import { useDataVersion } from '../app/DataVersion'
import { useSearchParams } from '../app/router'
import { AddCandidateModal } from '../components/AddCandidateModal'
import { CandidateCard } from '../components/CandidateCard'
import { CandidateDetailsDrawer } from '../components/CandidateDetailsDrawer'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { SearchHelp } from '../components/SearchHelp'
import { Button } from '../components/ui/Button'
import { SelectInput } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/StatusViews'
import { EXPERIENCE_LEVEL_LABELS } from '../domain/candidates'
import { nextStage, STAGE_LABELS } from '../domain/stages'
import { countLabel, describeFilters, describeMatch, extraParseDetail, isNameOnly } from '../domain/searchSummary'
import { useAsync } from '../hooks/useAsync'
import { useNow } from '../hooks/useNow'
import { useSearchInput } from '../hooks/useSearchInput'
import { useToast } from '../hooks/useToast'

const PAGE_SIZE = 12
const STAGES: readonly Stage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']

const SORT_LABELS: Record<CandidateSort, string> = {
  latest: 'Newest first',
  oldest: 'Oldest first',
  name: 'Name (A–Z)',
  stage: 'Pipeline stage',
  'longest-in-stage': 'Longest in stage',
}

type SearchState =
  | { status: 'idle' }
  | { status: 'searching'; query: string }
  | { status: 'results'; query: string; parsed: ParsedQuery; results: SearchResult[] }
  | { status: 'unparsed'; query: string; message: string }
  | { status: 'error'; query: string; message: string }

export default function CandidatesPage() {
  const toast = useToast()
  const { version, bump } = useDataVersion()
  const now = useNow(30_000)
  const [params, setParams] = useSearchParams()

  const jobId = params.get('jobId') ?? undefined
  const stage = (params.get('stage') as Stage | null) ?? undefined
  const experience = (params.get('experience') as ExperienceLevel | null) ?? undefined
  const tagId = params.get('tagId') ?? undefined
  const openId = params.get('open')
  const [sort, setSort] = useState<CandidateSort>('latest')
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)

  const [search, setSearch] = useState<SearchState>({ status: 'idle' })
  const searchSeq = useRef(0)
  const searchAbort = useRef<AbortController | null>(null)

  const runSearch = useCallback((query: string) => {
    searchSeq.current += 1
    const seq = searchSeq.current
    searchAbort.current?.abort()
    const controller = new AbortController()
    searchAbort.current = controller
    setSearch({ status: 'searching', query })
    searchCandidates(query, controller.signal).then(
      (res) => {
        if (seq !== searchSeq.current) return
        if (res.success) setSearch({ status: 'results', query, parsed: res.parsedQuery, results: res.results })
        else setSearch({ status: 'unparsed', query, message: res.message })
      },
      (err: unknown) => {
        if (seq !== searchSeq.current || (err instanceof Error && err.name === 'AbortError')) return
        setSearch({ status: 'error', query, message: errorMessage(err) })
      },
    )
  }, [])

  const clearSearch = useCallback(() => {
    searchSeq.current += 1
    searchAbort.current?.abort()
    setSearch({ status: 'idle' })
  }, [])

  const searchBox = useSearchInput({ runSearch, clearSearch })
  const searching = search.status !== 'idle'

  const jobs = useAsync(() => listJobs({ sort: 'title' }), [version])
  const tags = useAsync(() => listTags(), [version])
  const browse = useAsync(
    (signal) => listCandidates({ jobId, stage, experience, tagId, sort, page, pageSize: PAGE_SIZE }, signal),
    [jobId, stage, experience, tagId, sort, page, version],
  )

  const [pending, setPending] = useState<Record<string, 'moving' | 'rejecting'>>({})
  const [adding, setAdding] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<Candidate | null>(null)
  const inFlight = useRef(new Set<string>())

  useEffect(() => setPage(1), [jobId, stage, experience, tagId, sort])

  function setFilter(key: 'jobId' | 'stage' | 'experience' | 'tagId', value: string | undefined) {
    setParams({ [key]: value })
  }

  async function refetchActive() {
    if (searching) runSearch(search.query)
    else browse.reload()
  }

  async function mutate(id: string, kind: 'moving' | 'rejecting', action: () => Promise<Candidate>) {
    if (inFlight.current.has(id)) return
    inFlight.current.add(id)
    setPending((p) => ({ ...p, [id]: kind }))
    try {
      await action()
      await refetchActive()
      bump()
    } catch (err) {
      if (isStaleStateError(err)) await refetchActive()
      throw err
    } finally {
      inFlight.current.delete(id)
      setPending((p) => {
        const next = { ...p }
        delete next[id]
        return next
      })
    }
  }

  async function handleMove(candidate: Candidate) {
    const to = nextStage(candidate.currentStage)
    if (!to) return
    try {
      await mutate(candidate.id, 'moving', () => transitionCandidate(candidate.id, to))
      toast.success(`Moved ${candidate.name} to ${STAGE_LABELS[to]}.`)
    } catch (err) {
      toast.error(`Couldn’t move ${candidate.name}: ${errorMessage(err)}`)
    }
  }

  async function handleConfirmReject() {
    const candidate = rejectTarget
    if (!candidate) return
    try {
      await mutate(candidate.id, 'rejecting', () => rejectCandidate(candidate.id))
      toast.success(`Rejected ${candidate.name}.`)
    } catch (err) {
      toast.error(`Couldn’t reject ${candidate.name}: ${errorMessage(err)}`)
    } finally {
      setRejectTarget(null)
    }
  }

  const [exporting, setExporting] = useState(false)
  async function handleExport() {
    setExporting(true)
    try {
      await exportCandidates({ jobId, stage, experience, tagId })
    } catch (err) {
      toast.error(`Couldn’t export candidates: ${errorMessage(err)}`)
    } finally {
      setExporting(false)
    }
  }

  const jobList = jobs.data ?? []
  const tagList: TagWithCount[] = tags.data ?? []
  const activeFilterCount = [jobId, stage, experience, tagId].filter(Boolean).length

  const matches = useMemo(() => {
    if (search.status !== 'results') return {}
    return Object.fromEntries(search.results.map((r) => [r.id, { score: r.score, matchType: r.matchType }]))
  }, [search])

  function renderCards(list: Candidate[], ranked: boolean) {
    return (
      <ul aria-label="Candidates" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {list.map((c, i) => {
          const match = matches[c.id]
          return (
            <li key={c.id}>
              <CandidateCard
                candidate={c}
                now={now}
                pending={pending[c.id]}
                canAct
                rank={ranked ? i + 1 : undefined}
                matchNote={match?.matchType && search.status === 'results' && search.parsed.name ? describeMatch(match.matchType, search.parsed.name.query) : undefined}
                onMove={(cand) => void handleMove(cand)}
                onReject={setRejectTarget}
              />
            </li>
          )
        })}
      </ul>
    )
  }

  function renderSearch() {
    if (search.status === 'error') {
      return <ErrorState title="Search isn’t working right now" message={search.message} onRetry={() => runSearch(search.query)} />
    }
    if (search.status === 'unparsed') {
      return <SearchHelp detail={extraParseDetail(search.message)} onShowAll={searchBox.onClear} />
    }
    if (search.status === 'results') {
      if (search.results.length === 0) {
        if (isNameOnly(search.parsed)) return <SearchHelp lookedForName={search.parsed.name?.query} onShowAll={searchBox.onClear} />
        return (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="No candidates found"
            description={`I understood your search (${describeFilters(search.parsed).join('; ') || 'no filters'}), but nobody matches all of it.`}
            action={<Button onClick={searchBox.onClear}>Show all candidates</Button>}
          />
        )
      }
      const ranked = search.results.some((r) => r.score !== null)
      const labels = describeFilters(search.parsed)
      return (
        <div>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-950">{countLabel(search.results.length)}</h2>
              {labels.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Search filters">
                  {labels.map((l) => (
                    <li key={l} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-200">{l}</li>
                  ))}
                </ul>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={searchBox.onClear}>Show all candidates</Button>
          </div>
          {renderCards(search.results, ranked)}
        </div>
      )
    }
    return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56" />)}</div>
  }

  function renderBrowse() {
    if (browse.error && !browse.data) return <ErrorState message={browse.error} onRetry={browse.reload} title="Couldn’t load candidates" />
    if (!browse.data) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-56" />)}</div>
    if (browse.data.total === 0) {
      return (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title={activeFilterCount > 0 ? 'No candidates match these filters' : 'No candidates yet'}
          description={activeFilterCount > 0 ? 'Try widening or clearing a filter.' : 'Add your first candidate to get started.'}
          action={activeFilterCount > 0 ? <Button onClick={() => setParams({ jobId: undefined, stage: undefined, experience: undefined, tagId: undefined })}>Clear filters</Button> : <Button variant="primary" onClick={() => setAdding(true)}>Add Candidate</Button>}
        />
      )
    }
    return (
      <div className={browse.loading ? 'opacity-60 transition-opacity' : ''}>
        {renderCards(browse.data.items, false)}
        <div className="mt-6">
          <Pagination page={browse.data.page} pageSize={browse.data.pageSize} total={browse.data.total} onPage={setPage} noun="candidates" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Candidates"
        title="All Candidates"
        subtitle="Search, filter and move candidates through your hiring pipeline."
        actions={
          <>
            <Button onClick={() => void handleExport()} loading={exporting} loadingLabel="Exporting…">
              <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add Candidate
            </Button>
          </>
        }
      />

      <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            searchBox.onSubmit(searchBox.text)
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <input
              type="search"
              value={searchBox.text}
              onChange={(e) => searchBox.onChange(e.target.value)}
              placeholder="Ask anything — “Priya in Screening”, “stuck in Interview for a week”…"
              autoComplete="off"
              className="h-11 w-full rounded-xl border border-line-strong bg-white pr-10 pl-10 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 [&::-webkit-search-cancel-button]:hidden"
            />
            {searchBox.text && (
              <button type="button" onClick={searchBox.onClear} aria-label="Clear search" className="absolute top-1/2 right-2.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-ink-400 hover:text-ink-800">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button type="submit" variant="primary" loading={search.status === 'searching'} loadingLabel="Searching…">
            Search
          </Button>
          <Button type="button" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filters
            {activeFilterCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{activeFilterCount}</span>}
          </Button>
        </form>

        {showFilters && !searching && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <SelectInput aria-label="Filter by job" value={jobId ?? ''} onChange={(e) => setFilter('jobId', e.target.value || undefined)} className="w-44">
              <option value="">All jobs</option>
              {jobList.map((j) => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </SelectInput>
            <SelectInput aria-label="Filter by stage" value={stage ?? ''} onChange={(e) => setFilter('stage', e.target.value || undefined)} className="w-40">
              <option value="">Any stage</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </SelectInput>
            <SelectInput aria-label="Filter by experience" value={experience ?? ''} onChange={(e) => setFilter('experience', e.target.value || undefined)} className="w-44">
              <option value="">Any experience</option>
              {(Object.keys(EXPERIENCE_LEVEL_LABELS) as ExperienceLevel[]).map((e) => (
                <option key={e} value={e}>{EXPERIENCE_LEVEL_LABELS[e]}</option>
              ))}
            </SelectInput>
            {tagList.length > 0 && (
              <SelectInput aria-label="Filter by tag" value={tagId ?? ''} onChange={(e) => setFilter('tagId', e.target.value || undefined)} className="w-40">
                <option value="">Any tag</option>
                {tagList.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.candidateCount})</option>
                ))}
              </SelectInput>
            )}
            <SelectInput aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as CandidateSort)} className="w-44">
              {(Object.keys(SORT_LABELS) as CandidateSort[]).map((s) => (
                <option key={s} value={s}>{SORT_LABELS[s]}</option>
              ))}
            </SelectInput>
            {activeFilterCount > 0 && (
              <button type="button" onClick={() => setParams({ jobId: undefined, stage: undefined, experience: undefined, tagId: undefined })} className="text-xs font-medium text-ink-500 hover:text-ink-800">
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {searching ? renderSearch() : renderBrowse()}

      {adding && (
        <AddCandidateModal
          jobs={jobList}
          defaultJobId={jobId}
          onClose={() => setAdding(false)}
          onCreated={(created) => {
            toast.success(`Added ${created.name} to Applied.`)
            setAdding(false)
            bump()
          }}
        />
      )}

      {rejectTarget && (
        <ConfirmDialog
          title={`Reject ${rejectTarget.name}?`}
          confirmLabel="Reject candidate"
          busyLabel="Rejecting…"
          danger
          busy={pending[rejectTarget.id] === 'rejecting'}
          onConfirm={() => void handleConfirmReject()}
          onCancel={() => setRejectTarget(null)}
        >
          This can’t be undone — {rejectTarget.name} will move to Rejected and can no longer be advanced.
        </ConfirmDialog>
      )}

      {openId && <CandidateDetailsDrawer candidateId={openId} onClose={() => setParams({ open: undefined })} />}
    </div>
  )
}
