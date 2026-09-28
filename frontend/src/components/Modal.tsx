import { useEffect, useId, useRef, type ReactNode } from 'react'

type Props = {
  title: string
  onClose: () => void
  /** When false, Escape and backdrop clicks are ignored (e.g. a request is in flight). */
  dismissable?: boolean
  /** `drawer` docks the panel to the right edge (full screen on phones). */
  variant?: 'dialog' | 'drawer'
  children: ReactNode
}

const VARIANT_CLASSES = {
  dialog: 'm-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md rounded-xl',
  drawer: 'm-0 ml-auto h-dvh max-h-none w-full max-w-lg rounded-none sm:rounded-l-xl',
}

/**
 * Built on the native <dialog> element: showModal() provides the backdrop,
 * focus trapping, inert page behind it, Escape handling, and returns focus to
 * the opener on close. Mount it to open it; unmount it to close it.
 */
export function Modal({ title, onClose, dismissable = true, variant = 'dialog', children }: Props) {
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
      className={`overflow-y-auto bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40 ${VARIANT_CLASSES[variant]}`}
    >
      <div className="p-6">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  )
}
