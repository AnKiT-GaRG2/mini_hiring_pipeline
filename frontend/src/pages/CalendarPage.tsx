import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock, Globe2, Plus, Trophy, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getInterview, getInterviewStats, listInterviews, listUpcomingInterviews } from '../api/interviews'
import { listCandidates } from '../api/candidates'
import type { Interview } from '../api/types'
import { useDataVersion } from '../app/DataVersion'
import { useSearchParams } from '../app/router'
import { InterviewDetailsModal } from '../components/InterviewDetailsModal'
import { InterviewEventCard } from '../components/InterviewEventCard'
import { ScheduleInterviewModal } from '../components/ScheduleInterviewModal'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, Skeleton } from '../components/ui/StatusViews'
import { formatDate } from '../domain/format'
import { INTERVIEW_STYLES, INTERVIEW_TYPE_LABELS, isVisibleEvent, PLATFORM_ICONS } from '../domain/interviews'
import {
  addDays, addMonths, compareDays, dayOfWeek, daysRange, formatMonthYear, formatRangeLabel, formatTime,
  isValidZone, monthGrid, parseYmdKey, sameDay, startOfMonth, startOfWeek, weekdayLong, WEEKDAYS, ymdKey, ymdOf, zoneOptions,
  type Ymd,
} from '../domain/time'
import { useAsync } from '../hooks/useAsync'
import { useNow } from '../hooks/useNow'

type View = 'day' | 'week' | 'month'

const TZ_KEY = 'hiring-pipeline.calendarTz'
const HOUR_START = 7
const HOUR_END = 20
const ROW_PX = 64

function loadTz(): string {
  try {
    const saved = localStorage.getItem(TZ_KEY)
    if (saved && isValidZone(saved)) return saved
  } catch {
    /* ignore */
  }
  return 'Asia/Kolkata'
}

function saveTz(tz: string) {
  try {
    localStorage.setItem(TZ_KEY, tz)
  } catch {
    /* ignore */
  }
}

/** Splits a day's events into side-by-side columns so overlapping interviews don't cover each other. */
function layout(events: Interview[], tz: string): { event: Interview; col: number; cols: number }[] {
  const withRange = events
    .map((e) => ({ e, start: new Date(e.startsAt).getTime(), end: new Date(e.endsAt).getTime() }))
    .sort((a, b) => a.start - b.start)

  const out: { event: Interview; col: number; cols: number }[] = []
  let cluster: typeof withRange = []
  let clusterEnd = -Infinity

  const flush = () => {
    if (cluster.length === 0) return
    const colEndTimes: number[] = []
    const placed = cluster.map((item) => {
      let col = colEndTimes.findIndex((end) => end <= item.start)
      if (col === -1) {
        col = colEndTimes.length
        colEndTimes.push(item.end)
      } else {
        colEndTimes[col] = item.end
      }
      return { event: item.e, col }
    })
    const cols = colEndTimes.length
    for (const p of placed) out.push({ ...p, cols })
    cluster = []
  }

  for (const item of withRange) {
    if (item.start >= clusterEnd) flush()
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  flush()
  void tz
  return out
}

function timeGridStyle(startsAt: string, endsAt: string, tz: string, col: number, cols: number): React.CSSProperties {
  const startParts = new Date(startsAt)
  const hour = Number(startParts.toLocaleString('en-US', { timeZone: tz, hour12: false, hour: '2-digit' })) % 24
  const minute = Number(startParts.toLocaleString('en-US', { timeZone: tz, minute: '2-digit' }))
  const top = (hour - HOUR_START + minute / 60) * ROW_PX
  const minutes = Math.max(20, (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000)
  const height = (minutes / 60) * ROW_PX
  const widthPct = 100 / cols
  return { top, height: Math.max(32, height - 3), left: `${col * widthPct}%`, width: `calc(${widthPct}% - 4px)` }
}

export default function CalendarPage() {
  const { version, bump } = useDataVersion()
  const now = useNow(60_000)
  const [params, setParams] = useSearchParams()

  const [tz, setTz] = useState(loadTz)
  const [view, setView] = useState<View>('week')
  const [anchor, setAnchor] = useState<Ymd>(() => ymdOf(now, tz))
  const [monthCursor, setMonthCursor] = useState<Ymd>(() => startOfMonth(ymdOf(now, tz)))
  const [selected, setSelected] = useState<Interview | null>(null)
  const [rescheduling, setRescheduling] = useState(false)
  const [scheduling, setScheduling] = useState<{ day: Ymd; hour?: number } | null>(null)

  useEffect(() => saveTz(tz), [tz])

  // Arriving from elsewhere (a search result, a notification, "View in Calendar" on a
  // candidate): ?date jumps the visible day, ?open fetches and opens that interview.
  const paramDate = params.get('date')
  const paramOpen = params.get('open')
  const filterCandidateId = params.get('candidateId') ?? undefined
  const filterCandidateName = params.get('name') ?? undefined

  useEffect(() => {
    if (!paramDate) return
    const day = parseYmdKey(paramDate)
    if (!day) return
    setAnchor(day)
    setMonthCursor(startOfMonth(day))
    setView('day')
    // Only ever jump to a linked-to date once — after that the calendar's own controls drive it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramDate])

  useEffect(() => {
    if (!paramOpen) return
    let cancelled = false
    getInterview(paramOpen).then(
      (iv) => {
        if (!cancelled) setSelected(iv)
      },
      () => {}, // the interview may have been deleted since the link was made; nothing to open
    )
    return () => {
      cancelled = true
    }
  }, [paramOpen])

  const first = view === 'day' ? anchor : view === 'week' ? startOfWeek(anchor) : monthGrid(monthCursor)[0]
  const last = view === 'day' ? anchor : view === 'week' ? addDays(first, 6) : monthGrid(monthCursor).at(-1)!
  const range = useMemo(() => daysRange(first, last, tz), [first.y, first.m, first.d, last.y, last.m, last.d, tz])

  const interviews = useAsync(
    (signal) => listInterviews({ from: range.from.toISOString(), to: range.to.toISOString(), candidateId: filterCandidateId }, signal),
    [range.from.getTime(), range.to.getTime(), tz, filterCandidateId, version],
  )
  const upcoming = useAsync(() => listUpcomingInterviews(4), [version])
  const candidatesData = useAsync(() => listCandidates({ sort: 'latest', pageSize: 100 }), [version])

  const today = ymdOf(now, tz)
  const statRanges = useMemo(() => {
    const weekFrom = startOfWeek(today)
    return {
      todayFrom: daysRange(today, today, tz).from.toISOString(),
      todayTo: daysRange(today, today, tz).to.toISOString(),
      weekFrom: daysRange(weekFrom, addDays(weekFrom, 6), tz).from.toISOString(),
      weekTo: daysRange(weekFrom, addDays(weekFrom, 6), tz).to.toISOString(),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today.y, today.m, today.d, tz])
  const stats = useAsync(() => getInterviewStats(statRanges), [statRanges, version])

  const events = (interviews.data ?? []).filter(isVisibleEvent)
  const eventsByDay = useMemo(() => {
    const map = new Map<string, Interview[]>()
    for (const e of events) {
      const key = ymdKey(ymdOf(new Date(e.startsAt), tz))
      map.set(key, [...(map.get(key) ?? []), e])
    }
    return map
  }, [events, tz])

  function step(dir: 1 | -1) {
    if (view === 'day') setAnchor((a) => addDays(a, dir))
    else if (view === 'week') setAnchor((a) => addDays(a, dir * 7))
    else setMonthCursor((m) => addMonths(m, dir))
  }
  function goToday() {
    setAnchor(today)
    setMonthCursor(startOfMonth(today))
  }

  const label = view === 'month' ? formatMonthYear(monthCursor) : formatRangeLabel(first, last)
  const days = view === 'day' ? [anchor] : view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(first, i)) : []
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)

  function candidateOptions() {
    return (candidatesData.data?.items ?? []).filter((c) => c.currentStage !== 'HIRED' && c.currentStage !== 'REJECTED').map((c) => ({ id: c.id, name: c.name }))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Calendar"
        title="Calendar"
        subtitle="Keep track of interviews, meetings and important hiring events."
        actions={
          <>
            <div role="tablist" aria-label="Calendar view" className="flex rounded-xl border border-line-strong bg-white p-1">
              {(['day', 'week', 'month'] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${view === v ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-tint'}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <Button variant="primary" onClick={() => setScheduling({ day: today, hour: undefined })}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Schedule Interview
            </Button>
          </>
        }
      />

      {filterCandidateId && (
        <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm text-brand-800">
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Showing interviews for <strong className="font-semibold">{filterCandidateName ?? 'this candidate'}</strong>
          </span>
          <button
            type="button"
            onClick={() => setParams({ candidateId: undefined, name: undefined })}
            className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
          >
            Clear <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => step(-1)} aria-label="Previous" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-tint">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" onClick={goToday} className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-ink-950 hover:bg-tint">
                  {label}
                </button>
                <button type="button" onClick={() => step(1)} aria-label="Next" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-tint">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-ink-500">
                <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
                <select value={tz} onChange={(e) => setTz(e.target.value)} className="rounded-md border-0 bg-tint py-1 pr-6 pl-1.5 text-xs font-medium text-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                  {zoneOptions(tz).map((z) => (
                    <option key={z.id} value={z.id}>{z.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {interviews.loading && !interviews.data && <Skeleton className="mt-4 h-[500px]" />}

            {(view === 'day' || view === 'week') && (
              <div className="scrollbar-thin mt-4 overflow-x-auto">
                <div style={{ minWidth: view === 'week' ? 7 * 168 + 56 : 380 }}>
                  <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
                    <div />
                    {days.map((d) => (
                      <div key={ymdKey(d)} className="border-b border-line px-1 pb-2 text-center">
                        <p className="text-[11px] font-medium text-ink-400">{WEEKDAYS[dayOfWeek(d)]}</p>
                        <p className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${sameDay(d, today) ? 'bg-brand-600 text-white' : 'text-ink-800'}`}>{d.d}</p>
                      </div>
                    ))}
                  </div>

                  <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
                    <div>
                      {hours.map((h) => (
                        <div key={h} style={{ height: ROW_PX }} className="-translate-y-2 pr-2 text-right text-[11px] text-ink-400">
                          {h % 12 === 0 ? 12 : h % 12} {h < 12 ? 'AM' : 'PM'}
                        </div>
                      ))}
                    </div>
                    {days.map((d) => {
                      const dayEvents = layout(eventsByDay.get(ymdKey(d)) ?? [], tz)
                      return (
                        <div key={ymdKey(d)} className="relative border-l border-line">
                          {hours.map((h) => (
                            <button
                              key={h}
                              type="button"
                              style={{ height: ROW_PX }}
                              onClick={() => setScheduling({ day: d, hour: h })}
                              aria-label={`Schedule at ${h}:00 on ${weekdayLong(d)}`}
                              className="block w-full border-b border-line/70 hover:bg-brand-50/40"
                            />
                          ))}
                          {dayEvents.map(({ event, col, cols }) => (
                            <InterviewEventCard key={event.id} interview={event} tz={tz} onClick={() => setSelected(event)} style={timeGridStyle(event.startsAt, event.endsAt, tz, col, cols)} />
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {view === 'month' && (
              <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="bg-white py-2 text-center text-[11px] font-medium text-ink-400">{w}</div>
                ))}
                {monthGrid(monthCursor).map((d) => {
                  const dayEvents = (eventsByDay.get(ymdKey(d)) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
                  const inMonth = d.m === monthCursor.m
                  return (
                    <div key={ymdKey(d)} className={`min-h-[104px] bg-white p-1.5 ${inMonth ? '' : 'bg-tint/40'}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setAnchor(d)
                          setView('day')
                        }}
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${sameDay(d, today) ? 'bg-brand-600 text-white' : inMonth ? 'text-ink-800 hover:bg-tint' : 'text-ink-300'}`}
                      >
                        {d.d}
                      </button>
                      <div className="mt-1 space-y-1">
                        {dayEvents.slice(0, 3).map((e) => (
                          <InterviewEventCard key={e.id} interview={e} tz={tz} onClick={() => setSelected(e)} compact />
                        ))}
                        {dayEvents.length > 3 && (
                          <button
                            type="button"
                            onClick={() => {
                              setAnchor(d)
                              setView('day')
                            }}
                            className="px-1 text-[11px] font-medium text-ink-500 hover:text-brand-600"
                          >
                            +{dayEvents.length - 3} more
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink-950">Today’s Interviews</h2>
            </div>
            <div className="mt-3">
              {interviews.data && (eventsByDay.get(ymdKey(today)) ?? []).filter(isVisibleEvent).length === 0 && (
                <p className="py-6 text-center text-sm text-ink-400">Nothing scheduled today.</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {(eventsByDay.get(ymdKey(today)) ?? [])
                  .filter(isVisibleEvent)
                  .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
                  .map((iv) => {
                    const PlatformIcon = PLATFORM_ICONS[iv.platform]
                    return (
                      <button key={iv.id} type="button" onClick={() => setSelected(iv)} className="flex flex-col items-start gap-2 rounded-xl border border-line p-3 text-left hover:bg-tint">
                        <div className="flex items-center gap-2">
                          <Avatar name={iv.candidate.name} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink-950">{iv.candidate.name}</p>
                            <p className="truncate text-xs text-ink-500">{iv.candidate.job?.title ?? '—'}</p>
                          </div>
                        </div>
                        <p className="flex items-center gap-1.5 text-xs text-ink-500">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {formatTime(iv.startsAt, tz)} – {formatTime(iv.endsAt, tz)}
                        </p>
                        <p className="flex items-center gap-1.5 text-xs text-ink-500">
                          <PlatformIcon className="h-3.5 w-3.5" aria-hidden="true" /> {INTERVIEW_TYPE_LABELS[iv.type]}
                        </p>
                      </button>
                    )
                  })}
              </div>
            </div>
          </Card>
        </div>

        <aside className="space-y-6" aria-label="Calendar insights">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink-950">Upcoming Events</h2>
            </div>
            <div className="mt-2">
              {upcoming.loading && !upcoming.data && [0, 1, 2].map((i) => <Skeleton key={i} className="mt-2 h-14" />)}
              {upcoming.data && upcoming.data.length === 0 && <p className="py-6 text-center text-sm text-ink-400">Nothing coming up.</p>}
              <ul className="divide-y divide-line">
                {upcoming.data?.map((iv) => {
                  const styles = INTERVIEW_STYLES[iv.type]
                  return (
                    <li key={iv.id}>
                      <button type="button" onClick={() => setSelected(iv)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-tint">
                        <div className="w-14 shrink-0">
                          <p className="text-xs font-semibold text-ink-950">{formatTime(iv.startsAt, tz)}</p>
                          <p className="text-[11px] text-ink-400">{sameDay(ymdOf(new Date(iv.startsAt), tz), today) ? 'Today' : formatDate(iv.startsAt).slice(0, 6)}</p>
                        </div>
                        <span className={`h-8 w-1 shrink-0 rounded-full ${styles.dot}`} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink-950">{iv.candidate.name}</p>
                          <p className="truncate text-xs text-ink-500">{INTERVIEW_TYPE_LABELS[iv.type]}</p>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink-950">Calendar Overview</h2>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setMonthCursor((m) => addMonths(m, -1))} aria-label="Previous month" className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 hover:bg-tint">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => setMonthCursor((m) => addMonths(m, 1))} aria-label="Next month" className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 hover:bg-tint">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs font-medium text-ink-500">{formatMonthYear(monthCursor)}</p>
            <div className="mt-2 grid grid-cols-7 gap-y-1 text-center text-[11px]">
              {WEEKDAYS.map((w) => (
                <span key={w} className="text-ink-400">{w[0]}</span>
              ))}
              {monthGrid(monthCursor).map((d) => (
                <button
                  key={ymdKey(d)}
                  type="button"
                  onClick={() => {
                    setAnchor(d)
                    setView('day')
                  }}
                  className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full ${
                    sameDay(d, anchor) ? 'bg-brand-600 text-white' : sameDay(d, today) ? 'font-semibold text-brand-700 ring-1 ring-brand-300' : d.m === monthCursor.m ? 'text-ink-700 hover:bg-tint' : 'text-ink-300'
                  } ${compareDays(d, today) === 0 && !sameDay(d, anchor) ? '' : ''}`}
                >
                  {d.d}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-[15px] font-semibold text-ink-950">Quick Stats</h2>
            <dl className="mt-3 grid grid-cols-2 gap-4">
              {[
                { label: 'Today', value: stats.data?.today, icon: CalendarDays, tile: 'bg-brand-50 text-brand-600' },
                { label: 'This Week', value: stats.data?.week, icon: CalendarClock, tile: 'bg-violet-50 text-violet-600' },
                { label: 'Interviews', value: stats.data?.upcoming, icon: Users, tile: 'bg-sky-50 text-sky-600' },
                { label: 'Offers', value: stats.data?.offers, icon: Trophy, tile: 'bg-amber-50 text-amber-600' },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2.5">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${s.tile}`}>
                    <s.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <dt className="text-[11px] text-ink-500">{s.label}</dt>
                    <dd className="text-lg leading-none font-bold text-ink-950">{s.value ?? '—'}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </Card>
        </aside>
      </div>

      {interviews.data && interviews.data.length === 0 && !interviews.loading && view !== 'month' && (
        <EmptyState icon={<CalendarDays className="h-5 w-5" />} title="Nothing scheduled in this range" description="Schedule an interview to see it here." />
      )}

      {scheduling && (
        <ScheduleInterviewModal
          candidates={candidateOptions()}
          defaultCandidateId={filterCandidateId}
          defaultDay={scheduling.day}
          defaultHour={scheduling.hour}
          tz={tz}
          onClose={() => setScheduling(null)}
          onSaved={() => {
            setScheduling(null)
            interviews.reload()
            bump()
          }}
        />
      )}

      {selected && !rescheduling && (
        <InterviewDetailsModal
          interview={selected}
          tz={tz}
          onClose={() => setSelected(null)}
          onReschedule={() => setRescheduling(true)}
          onChanged={(updated) => {
            setSelected(updated)
            interviews.reload()
          }}
        />
      )}

      {selected && rescheduling && (
        <ScheduleInterviewModal
          candidates={candidateOptions()}
          interview={selected}
          tz={tz}
          onClose={() => setRescheduling(false)}
          onSaved={(updated) => {
            setSelected(updated)
            setRescheduling(false)
            interviews.reload()
            bump()
          }}
        />
      )}
    </div>
  )
}
