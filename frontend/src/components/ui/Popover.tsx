import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  /** Which edge of the anchor the panel lines up with. */
  align?: 'start' | 'end'
  className?: string
  role?: string
  'aria-label'?: string
  children: ReactNode
}

const GAP = 6
const MARGIN = 8

/**
 * A floating panel anchored to a button. It is rendered into <body> and
 * positioned with fixed coordinates, so it is never clipped by a card, table or
 * scrolling container it happens to sit in; it flips above the anchor when
 * there isn't room below. Closes on Escape, on a press outside, and on scroll.
 */
export function Popover({ open, onClose, anchorRef, align = 'end', className = '', children, role, 'aria-label': ariaLabel }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  // `position: fixed` from the very first render, not just once the effect below sets real
  // coordinates: otherwise the panel first lays out in normal flow (full body width) and that
  // wrong width is what getBoundingClientRect() below measures, throwing off `left`.
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', top: 0, left: 0, visibility: 'hidden' })

  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const panel = panelRef.current
    if (!anchor || !panel) return
    const a = anchor.getBoundingClientRect()
    const p = panel.getBoundingClientRect()
    const below = window.innerHeight - a.bottom - GAP - MARGIN
    const above = a.top - GAP - MARGIN
    const top = p.height > below && above > below ? Math.max(MARGIN, a.top - GAP - p.height) : a.bottom + GAP
    const left = align === 'end' ? Math.max(MARGIN, a.right - p.width) : Math.min(a.left, window.innerWidth - p.width - MARGIN)
    setStyle({ position: 'fixed', top, left: Math.max(MARGIN, left), visibility: 'visible' })
  }, [open, anchorRef, align, children])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        anchorRef.current?.focus()
      }
    }
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return // scrolling inside the panel is fine
      onClose()
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      role={role}
      aria-label={ariaLabel}
      style={style}
      className={`z-[60] rounded-xl border border-line bg-white shadow-pop ${className}`}
    >
      {children}
    </div>,
    // A modal <dialog> sits in the top layer, so a popover opened from inside one must live inside it to be visible.
    (anchorRef.current?.closest('dialog') as HTMLElement | null) ?? document.body,
  )
}
