import { Briefcase, Calendar, CheckCircle2, Copy, MapPin, Pencil, User, Users, XCircle } from 'lucide-react'
import { useState } from 'react'
import { updateInterview } from '../api/interviews'
import { errorMessage } from '../api/http'
import type { Interview } from '../api/types'
import { useDataVersion } from '../app/DataVersion'
import { useNavigate } from '../app/router'
import { INTERVIEW_STYLES, INTERVIEW_TYPE_LABELS, PLATFORM_ICONS, PLATFORM_LABELS } from '../domain/interviews'
import { formatDate } from '../domain/format'
import { formatTimeRange } from '../domain/time'
import { useToast } from '../hooks/useToast'
import { ConfirmDialog } from './ConfirmDialog'
import { StageBadge } from './StageBadge'
import { Avatar } from './ui/Avatar'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'

type Props = {
  interview: Interview
  tz: string
  onClose: () => void
  onReschedule: () => void
  onChanged: (interview: Interview) => void
}

export function InterviewDetailsModal({ interview, tz, onClose, onReschedule, onChanged }: Props) {
  const toast = useToast()
  const navigate = useNavigate()
  const { bump } = useDataVersion()
  const [cancelling, setCancelling] = useState(false)
  const [busy, setBusy] = useState(false)
  const PlatformIcon = PLATFORM_ICONS[interview.platform]
  const styles = INTERVIEW_STYLES[interview.type]

  async function markCompleted() {
    setBusy(true)
    try {
      const updated = await updateInterview(interview.id, { status: 'COMPLETED' })
      toast.success('Marked as completed.')
      onChanged(updated)
      bump()
    } catch (err) {
      toast.error(`Couldn’t update: ${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  async function confirmCancel() {
    setBusy(true)
    try {
      const updated = await updateInterview(interview.id, { status: 'CANCELLED' })
      toast.success('Interview cancelled.')
      onChanged(updated)
      bump()
    } catch (err) {
      toast.error(`Couldn’t cancel: ${errorMessage(err)}`)
    } finally {
      setBusy(false)
      setCancelling(false)
    }
  }

  const scheduled = interview.status === 'SCHEDULED'

  return (
    <Modal title={INTERVIEW_TYPE_LABELS[interview.type]} onClose={onClose} size="sm" dismissable={!busy}>
      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden="true" /> {INTERVIEW_TYPE_LABELS[interview.type]}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${interview.status === 'SCHEDULED' ? 'bg-blue-50 text-blue-700' : interview.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            {interview.status[0]}{interview.status.slice(1).toLowerCase()}
          </span>
        </div>

        <button type="button" onClick={() => navigate(`/candidates?open=${encodeURIComponent(interview.candidate.id)}`)} className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left hover:bg-tint">
          <Avatar name={interview.candidate.name} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-950">{interview.candidate.name}</p>
            {interview.candidate.job && <p className="flex items-center gap-1 truncate text-xs text-ink-500"><Briefcase className="h-3 w-3" /> {interview.candidate.job.title}</p>}
          </div>
          <StageBadge stage={interview.candidate.currentStage} className="ml-auto shrink-0" />
        </button>

        <dl className="space-y-3 text-sm">
          <div className="flex items-center gap-2.5">
            <Calendar className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
            <span className="text-ink-700">{formatDate(interview.startsAt)} · {formatTimeRange(interview.startsAt, interview.endsAt, tz)}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <PlatformIcon className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
            <span className="text-ink-700">{PLATFORM_LABELS[interview.platform]}</span>
            {interview.meetingLink && (
              <a href={interview.meetingLink} target="_blank" rel="noreferrer" className="ml-auto text-xs font-medium text-brand-600 hover:underline">
                Join link
              </a>
            )}
          </div>
          {interview.location && (
            <div className="flex items-center gap-2.5">
              <MapPin className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" /> <span className="text-ink-700">{interview.location}</span>
            </div>
          )}
          <div className="flex items-start gap-2.5">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
            <span className="text-ink-700">{interview.interviewers.map((p) => p.name).join(', ')}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <User className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" /> <span className="text-ink-500">Scheduled by {interview.createdBy.name}</span>
          </div>
        </dl>

        {interview.notes && (
          <div className="rounded-lg bg-tint p-3 text-sm text-ink-700">
            <p className="mb-1 text-xs font-semibold tracking-wide text-ink-400 uppercase">Notes</p>
            {interview.notes}
          </div>
        )}

        {interview.meetingLink && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(interview.meetingLink!)
              toast.success('Link copied.')
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-800"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy meeting link
          </button>
        )}

        {scheduled && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button size="sm" onClick={onReschedule} disabled={busy}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Reschedule
            </Button>
            <Button size="sm" variant="soft" onClick={() => void markCompleted()} loading={busy} loadingLabel="Saving…">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Mark completed
            </Button>
            <Button size="sm" variant="danger" onClick={() => setCancelling(true)} disabled={busy}>
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
            </Button>
          </div>
        )}
      </div>

      {cancelling && (
        <ConfirmDialog title="Cancel this interview?" confirmLabel="Cancel interview" busyLabel="Cancelling…" danger busy={busy} onConfirm={() => void confirmCancel()} onCancel={() => setCancelling(false)}>
          {interview.candidate.name} and the interviewers won’t be told automatically — let them know separately.
        </ConfirmDialog>
      )}
    </Modal>
  )
}
