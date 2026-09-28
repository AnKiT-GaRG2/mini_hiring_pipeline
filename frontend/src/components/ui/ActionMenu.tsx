import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Popover } from './Popover'

export type MenuItem = {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  /** Left out of the menu entirely (for actions the person may not take). */
  hidden?: boolean
}

type Props = {
  /** Accessible name, e.g. "Actions for Priya Sharma". */
  label: string
  items: MenuItem[]
  className?: string
}

/** The "⋯" button and its menu. Items closer to destructive go last, and are red. */
export function ActionMenu({ label, items, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const visible = items.filter((i) => !i.hidden)

  if (visible.length === 0) return null

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-tint hover:text-ink-800 ${open ? 'bg-tint text-ink-800' : ''} ${className}`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <Popover open={open} onClose={close} anchorRef={anchorRef} role="menu" aria-label={label} className="min-w-44 p-1">
        {visible.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={(e) => {
              e.stopPropagation()
              close()
              item.onSelect()
            }}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              item.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-ink-800 hover:bg-tint'
            }`}
          >
            {item.icon && <item.icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />}
            {item.label}
          </button>
        ))}
      </Popover>
    </>
  )
}
