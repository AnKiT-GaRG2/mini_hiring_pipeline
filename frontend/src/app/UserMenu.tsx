import { Check, ChevronDown, Settings, UserRound } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { listTeam } from '../api/team'
import type { TeamMember } from '../api/types'
import { Avatar } from '../components/ui/Avatar'
import { Popover } from '../components/ui/Popover'
import { ROLE_LABELS } from '../domain/roles'
import { useCurrentUser } from './CurrentUser'
import { useNavigate } from './router'

export function UserMenu() {
  const { me, switchTo } = useCurrentUser()
  const navigate = useNavigate()
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<TeamMember[]>([])
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    listTeam().then(
      (team) => {
        if (!cancelled) setMembers(team.members.filter((m) => m.status === 'ACTIVE'))
      },
      () => {}, // the switcher is a convenience; the menu still works without it
    )
    return () => {
      cancelled = true
    }
  }, [open])

  function go(to: string) {
    close()
    navigate(to)
  }

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-800 hover:bg-tint'

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${me.name}`}
        className="flex items-center gap-3 rounded-xl py-1 pr-1 pl-2 hover:bg-tint"
      >
        <Avatar name={me.name} size="md" />
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-sm font-semibold text-ink-950">{me.name}</span>
          <span className="block text-xs text-ink-500">{ROLE_LABELS[me.role]}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-ink-400 md:block" aria-hidden="true" />
      </button>

      <Popover open={open} onClose={close} anchorRef={anchorRef} role="menu" aria-label="Account" className="w-72 p-1.5">
        <div className="px-3 py-2.5">
          <p className="text-sm font-semibold text-ink-950">{me.name}</p>
          <p className="truncate text-xs text-ink-500">{me.email}</p>
        </div>
        <button type="button" role="menuitem" className={item} onClick={() => go('/settings?tab=me')}>
          <UserRound className="h-4 w-4 opacity-70" aria-hidden="true" /> My details
        </button>
        <button type="button" role="menuitem" className={item} onClick={() => go('/settings')}>
          <Settings className="h-4 w-4 opacity-70" aria-hidden="true" /> Company settings
        </button>

        {members.length > 1 && (
          <>
            <div className="mx-2 my-1.5 border-t border-line" />
            <p className="px-3 pt-1 pb-1 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">Act as</p>
            <p className="px-3 pb-1.5 text-xs text-ink-500">There’s no sign-in yet. This lets you try the app as another team member.</p>
            <div className="scrollbar-thin max-h-56 overflow-y-auto">
              {members.map((m) => (
                <button key={m.id} type="button" role="menuitemradio" aria-checked={m.id === me.id} className={item} onClick={() => (m.id === me.id ? close() : switchTo(m.id))}>
                  <Avatar name={m.name} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{m.name}</span>
                    <span className="block text-xs text-ink-500">{ROLE_LABELS[m.role]}</span>
                  </span>
                  {m.id === me.id && <Check className="h-4 w-4 text-brand-600" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </>
        )}
      </Popover>
    </>
  )
}
