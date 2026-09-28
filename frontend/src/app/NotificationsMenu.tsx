import { Bell } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getNotifications, markNotificationsRead } from '../api/feed'
import type { NotificationsResponse } from '../api/types'
import { Popover } from '../components/ui/Popover'
import { timeAgo } from '../domain/format'
import { useDataVersion } from './DataVersion'
import { useNavigate } from './router'

const POLL_MS = 60_000

/** The bell: a red dot when there is something unread, and the latest notifications when opened. */
export function NotificationsMenu() {
  const navigate = useNavigate()
  const { version } = useDataVersion()
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<NotificationsResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  const load = useCallback(async () => {
    try {
      setData(await getNotifications())
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(id)
  }, [load, version])

  const unread = data?.unreadCount ?? 0

  async function markAll() {
    setData((d) => (d ? { unreadCount: 0, items: d.items.map((n) => ({ ...n, read: true })) } : d))
    try {
      await markNotificationsRead()
    } catch {
      void load() // put the real state back if it didn't save
    }
  }

  async function openItem(id: string, href: string | null) {
    close()
    setData((d) => (d ? { unreadCount: Math.max(0, d.unreadCount - (d.items.find((n) => n.id === id && !n.read) ? 1 : 0)), items: d.items.map((n) => (n.id === id ? { ...n, read: true } : n)) } : d))
    void markNotificationsRead([id]).catch(() => void load())
    if (href) navigate(href)
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-600 hover:bg-tint"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 && <span className="absolute top-2 right-2.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" aria-hidden="true" />}
      </button>

      <Popover open={open} onClose={close} anchorRef={anchorRef} role="dialog" aria-label="Notifications" className="w-[min(24rem,calc(100vw-1.5rem))]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-950">Notifications</h2>
          {unread > 0 && (
            <button type="button" onClick={() => void markAll()} className="text-xs font-medium text-brand-600 hover:text-brand-700">
              Mark all as read
            </button>
          )}
        </div>
        <div className="scrollbar-thin max-h-96 overflow-y-auto">
          {failed && !data && <p role="alert" className="px-4 py-8 text-center text-sm text-rose-600">Couldn’t load notifications.</p>}
          {data && data.items.length === 0 && <p role="status" className="px-4 py-8 text-center text-sm text-ink-500">You’re all caught up.</p>}
          <ul>
            {data?.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void openItem(n.id, n.href)}
                  className="flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 hover:bg-tint"
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand-500'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.read ? 'text-ink-600' : 'font-medium text-ink-950'}`}>{n.title}</span>
                    {n.body && <span className="block text-xs text-ink-500">{n.body}</span>}
                    <span className="mt-0.5 block text-xs text-ink-400">{timeAgo(n.createdAt)}</span>
                    {!n.read && <span className="sr-only">Unread</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Popover>
    </>
  )
}
