import type { ReactNode } from 'react'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'

type Props = {
  title: string
  children: ReactNode
  confirmLabel: string
  busyLabel?: string
  /** Style the confirm button as destructive. */
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Ask before doing something that is hard to undo. Neither Escape nor the backdrop dismisses it mid-request. */
export function ConfirmDialog({ title, children, confirmLabel, busyLabel, danger, busy, onConfirm, onCancel }: Props) {
  return (
    <Modal title={title} onClose={onCancel} dismissable={!busy} size="sm">
      <div className="mt-3 text-sm text-ink-600">{children}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant={danger ? 'dangerSolid' : 'primary'} onClick={onConfirm} loading={busy} loadingLabel={busyLabel ?? 'Working…'}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
