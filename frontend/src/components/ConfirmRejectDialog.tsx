import type { Candidate } from '../api/types'
import { Button } from './Button'
import { Modal } from './Modal'

type Props = {
  candidate: Candidate
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmRejectDialog({ candidate, busy, onConfirm, onCancel }: Props) {
  return (
    <Modal title={`Reject ${candidate.name}?`} onClose={onCancel} dismissable={!busy}>
      <p className="mt-2 text-sm text-slate-600">
        This moves {candidate.name} to Rejected. Rejection is final — a rejected candidate can’t be moved to
        another stage.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="dangerSolid" onClick={onConfirm} loading={busy} loadingLabel="Rejecting…">
          Reject candidate
        </Button>
      </div>
    </Modal>
  )
}
