import { Briefcase, CalendarClock, Search, Sparkles, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { globalSearch } from '../api/feed'
import type { GlobalSearchResponse } from '../api/types'
import { Avatar } from '../components/ui/Avatar'
import { StageBadge } from '../components/StageBadge'
import { INTERVIEW_TYPE_LABELS } from '../domain/interviews'
import { JOB_STATUS_LABELS } from '../domain/jobs'
import { addDays, ymdKey, ymdOf } from '../domain/time'
import { useDebounced } from '../hooks/useDebounced'
import { useNavigate } from './router'

type Row = { key: string; href: string; node: React.ReactNode }

const EMPTY: GlobalSearchResponse = { candidates: [], jobs: [], skills: [], interviews: [] }

/** "Today, 2:30 PM", "Tomorrow, 9:00 AM", or "Sep 30, 9:00 AM" further out — in the viewer's own zone. */
function describeWhen(iso: string): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const day = ymdOf(new Date(iso), tz)
  const today = ymdOf(Date.now(), tz)
  const time = new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const dayLabel =
    ymdKey(day) === ymdKey(today)
      ? 'Today'
      : ymdKey(day) === ymdKey(addDays(today, 1))
        ? 'Tomorrow'
        : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${dayLabel}, ${time}`
}

function Heading({ children }: { children: string }) {
  return <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">{children}</p>
}

/**
 * The top-bar quick search: jump to a candidate, a job, or everyone with a skill.
 * (The natural-language questions live on the Candidates page.)
 * Press Ctrl/⌘ K anywhere to focus it.
 */
export function GlobalSearch() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [results, setResults] = useState<GlobalSearchResponse>(EMPTY)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const query = useDebounced(text.trim(), 250)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [])

  useEffect(() => {
    if (!query) {
      setResults(EMPTY)
      setState('idle')
      return
    }
    const controller = new AbortController()
    setState('loading')
    globalSearch(query, controller.signal).then(
      (found) => {
        if (controller.signal.aborted) return
        setResults(found)
        setActive(0)
        setState('idle')
      },
      (err: unknown) => {
        if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return
        setState('error')
      },
    )
    return () => controller.abort()
  }, [query])

  const rows: Row[] = [
    ...results.candidates.map((c) => ({
      key: `c-${c.id}`,
      href: `/candidates?open=${encodeURIComponent(c.id)}`,
      node: (
        <>
          <Avatar name={c.name} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink-950">{c.name}</span>
            <span className="block truncate text-xs text-ink-500">{c.job?.title ?? c.email}</span>
          </span>
          <StageBadge stage={c.currentStage} />
        </>
      ),
    })),
    ...results.jobs.map((j) => ({
      key: `j-${j.id}`,
      href: `/jobs?q=${encodeURIComponent(j.title)}`,
      node: (
        <>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Briefcase className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-950">{j.title}</span>
          <span className="text-xs text-ink-500">{JOB_STATUS_LABELS[j.status]}</span>
        </>
      ),
    })),
    ...results.skills.map((s) => ({
      key: `s-${s.name}`,
      href: `/candidates?q=${encodeURIComponent(s.name)}`,
      node: (
        <>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-950">{s.name}</span>
          <span className="text-xs text-ink-500">
            {s.candidateCount} candidate{s.candidateCount === 1 ? '' : 's'}
          </span>
        </>
      ),
    })),
    ...results.interviews.map((iv) => ({
      key: `i-${iv.id}`,
      href: `/calendar?date=${ymdKey(ymdOf(new Date(iv.startsAt), Intl.DateTimeFormat().resolvedOptions().timeZone))}&open=${encodeURIComponent(iv.id)}`,
      node: (
        <>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink-950">{iv.candidate.name}</span>
            <span className="block truncate text-xs text-ink-500">{INTERVIEW_TYPE_LABELS[iv.type]}</span>
          </span>
          <span className="shrink-0 text-xs text-ink-500">{describeWhen(iv.startsAt)}</span>
        </>
      ),
    })),
  ]

  function go(href: string) {
    setOpen(false)
    setText('')
    inputRef.current?.blur()
    navigate(href)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(rows.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter' && open && rows[active]) {
      e.preventDefault()
      go(rows[active].href)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showPanel = open && query.length > 0
  const candidatesEnd = results.candidates.length
  const jobsEnd = candidatesEnd + results.jobs.length
  const skillsEnd = jobsEnd + results.skills.length
  const groups: { title: string; from: number; to: number }[] = [
    { title: 'Candidates', from: 0, to: candidatesEnd },
    { title: 'Jobs', from: candidatesEnd, to: jobsEnd },
    { title: 'Skills', from: jobsEnd, to: skillsEnd },
    { title: 'Interviews', from: skillsEnd, to: rows.length },
  ].filter((g) => g.to > g.from)

  return (
    <div ref={boxRef} className="relative min-w-0 max-w-xl flex-1">
      <div role="search">
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search candidates, jobs, or skills
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
        <input
          id={`${listId}-input`}
          ref={inputRef}
          type="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search candidates, jobs, or skills..."
          autoComplete="off"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          className="h-11 w-full rounded-xl border border-transparent bg-tint pr-16 pl-11 text-sm text-ink-950 placeholder:text-ink-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 [&::-webkit-search-cancel-button]:hidden"
        />
        {text ? (
          <button
            type="button"
            onClick={() => {
              setText('')
              inputRef.current?.focus()
            }}
            aria-label="Clear search"
            className="absolute top-1/2 right-3 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-ink-400 hover:text-ink-800"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-line-strong bg-white px-1.5 py-0.5 text-[11px] font-medium text-ink-500 sm:block">
            ⌘ K
          </kbd>
        )}
      </div>

      {showPanel && (
        <div id={listId} role="listbox" aria-label="Search results" className="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-white pb-2 shadow-pop">
          {state === 'error' && <p role="alert" className="px-4 py-6 text-center text-sm text-rose-600">Search isn’t working right now. Please try again.</p>}
          {state !== 'error' && rows.length === 0 && (
            <p role="status" className="px-4 py-6 text-center text-sm text-ink-500">
              {state === 'loading' ? 'Searching…' : `Nothing matches “${query}”.`}
            </p>
          )}
          {groups.map((group) => (
            <div key={group.title}>
              <Heading>{group.title}</Heading>
              {rows.slice(group.from, group.to).map((row, i) => {
                const index = group.from + i
                return (
                  <button
                    key={row.key}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(row.href)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left ${index === active ? 'bg-brand-50' : ''}`}
                  >
                    {row.node}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
