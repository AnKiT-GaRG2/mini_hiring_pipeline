import { CalendarCheck, CalendarClock, CalendarX, ChevronRight, MessageSquareText, UserPlus, ArrowRightCircle, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '../api/http'
import { getActivity } from '../api/feed'
import type { ActivityItem, ActivityType } from '../api/types'
import { useNavigate } from '../app/router'
import { timeAgo } from '../domain/format'
import { Avatar } from './ui/Avatar'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { InlineError, LoadingBlock } from './ui/StatusViews'
import { StageBadge } from './StageBadge'

const ICONS: Record<ActivityType, { Icon: LucideIcon; tone: string }> = {
  CANDIDATE_ADDED: { Icon: UserPlus, tone: 'bg-brand-50 text-brand-600' },
  STAGE_CHANGED: { Icon: ArrowRightCircle, tone: 'bg-violet-50 text-violet-600' },
  NOTE_ADDED: { Icon: MessageSquareText, tone: 'bg-slate-100 text-slate-600' },
  INTERVIEW_SCHEDULED: { Icon: CalendarClock, tone: 'bg-sky-50 text-sky-600' },
  INTERVIEW_RESCHEDULED: { Icon: CalendarClock, tone: 'bg-amber-50 text-amber-600' },
  INTERVIEW_CANCELLED: { Icon: CalendarX, tone: 'bg-rose-50 text-rose-600' },
  INTERVIEW_COMPLETED: { Icon: CalendarCheck, tone: 'bg-emerald-50 text-emerald-600' },
}

/** The sentence with the candidate's name in bold, wherever it appears. */
function Sentence({ item }: { item: ActivityItem }) {
  const name = item.candidate?.name
  if (!name || !item.summary.includes(name)) return <>{item.summary}</>
  const [before, ...rest] = item.summary.split(name)
  return (
    <>
      {before}
      <strong className="font-semibold text-ink-950">{name}</strong>
      {rest.join(name)}
    </>
  )
}

type RowProps = { item: ActivityItem; variant: 'avatar' | 'icon'; now?: number }

export function ActivityRow({ item, variant, now }: RowProps) {
  const navigate = useNavigate()
  const { Icon, tone } = ICONS[item.type]
  const open = item.candidate ? () => navigate(`/candidates?open=${encodeURIComponent(item.candidate!.id)}`) : undefined

  const lead =
    variant === 'avatar' ? (
      <Avatar name={item.candidate?.name ?? item.actor?.name ?? '?'} size="sm" />
    ) : (
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
    )

  const body = (
    <>
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink-600">
          <Sentence item={item} />
        </span>
        <span className="mt-0.5 block text-xs text-ink-400">{timeAgo(item.createdAt, now)}</span>
      </span>
      {variant === 'avatar' && item.stage && <StageBadge stage={item.stage} className="hidden sm:inline-flex" />}
      {open && variant === 'avatar' && <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" aria-hidden="true" />}
    </>
  )

  const classes = 'flex w-full items-center gap-3 px-1 py-2.5 text-left'
  return open ? (
    <button type="button" onClick={open} className={`${classes} rounded-lg hover:bg-tint`}>
      {body}
    </button>
  ) : (
    <div className={classes}>{body}</div>
  )
}

/** Every activity event, newest first, loaded a page at a time. */
export function ActivityFeedModal({ jobId, onClose }: { jobId?: string; onClose: () => void }) {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')

  const load = useCallback(
    async (before?: string) => {
      setState('loading')
      try {
        const page = await getActivity({ jobId, limit: 15, before })
        setItems((prev) => (before ? [...prev, ...page.items] : page.items))
        setNext(page.nextBefore)
        setState('ready')
      } catch (err) {
        setMessage(errorMessage(err))
        setState('error')
      }
    },
    [jobId],
  )

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Modal title="Recent activity" description="Everything that has happened in the pipeline, newest first." onClose={onClose} size="md">
      <div className="mt-4">
        {state === 'error' && <InlineError message={message} onRetry={() => void load(items.length > 0 ? next ?? undefined : undefined)} />}
        {items.length === 0 && state === 'loading' && <LoadingBlock />}
        {items.length === 0 && state === 'ready' && <p className="py-10 text-center text-sm text-ink-500">Nothing has happened yet.</p>}
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li key={item.id}>
              <ActivityRow item={item} variant="icon" />
            </li>
          ))}
        </ul>
        {next && (
          <div className="mt-4 flex justify-center">
            <Button onClick={() => void load(next)} loading={state === 'loading'} loadingLabel="Loading…">
              Load more
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

/** Renders rows with dividers; a tiny convenience so both pages lay them out the same way. */
export function ActivityList({ items, variant, now }: { items: ActivityItem[]; variant: 'avatar' | 'icon'; now?: number }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id}>
          <ActivityRow item={item} variant={variant} now={now} />
        </li>
      ))}
    </ul>
  )
}
