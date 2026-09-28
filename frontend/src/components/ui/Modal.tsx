import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

type Props = {
  title: string
  description?: string
  onClose: () => void
  /** When false, Escape and backdrop clicks are ignored (e.g. a request is in flight). */
  dismissable?: boolean
  /** `drawer` docks the panel to the right edge (full screen on phones). */
  variant?: 'dialog' | 'drawer'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const BOX = {
  dialog: {
    sm: 'm-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md rounded-2xl',
    md: 'm-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl rounded-2xl',
    lg: 'm-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl rounded-2xl',
  },
  drawer: {
    sm: 'm-0 ml-auto h-dvh max-h-none w-full max-w-md rounded-none sm:rounded-l-2xl',
    md: 'm-0 ml-auto h-dvh max-h-none w-full max-w-xl rounded-none sm:rounded-l-2xl',
    lg: 'm-0 ml-auto h-dvh max-h-none w-full max-w-2xl rounded-none sm:rounded-l-2xl',
  },
}

/**
 * Built on the native <dialog> element: showModal() provides the backdrop,
 * focus trapping, inert page behind it, Escape handling, and returns focus to
 * the opener on close. Mount it to open it; unmount it to close it.
 */
export function Modal({ title, description, onClose, dismissable = true, variant = 'dialog', size = 'md', children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault() // we close by unmounting, not by the browser
        if (dismissable) onClose()
      }}
      onClick={(e) => {
        // The dialog box has no padding of its own, so a click that lands on
        // the dialog element itself is a click on the backdrop.
        if (dismissable && e.target === e.currentTarget) onClose()
      }}
      className={`overflow-y-auto bg-white p-0 text-ink-800 shadow-pop backdrop:bg-ink-950/40 backdrop:backdrop-blur-[2px] ${BOX[variant][size]}`}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-ink-950">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
          </div>
          {dismissable && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 -mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-tint hover:text-ink-800"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {children}
      </div>
    </dialog>
  )
}
