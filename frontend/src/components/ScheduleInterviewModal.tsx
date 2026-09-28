import { useMemo, useState, type FormEvent } from 'react'
import { errorMessage, fieldErrorsOf } from '../api/http'
import { scheduleInterview, updateInterview } from '../api/interviews'
import { listTeam } from '../api/team'
import type { Interview, InterviewType, MeetingPlatform, ScheduleInterviewInput } from '../api/types'
import { DURATION_OPTIONS, INTERVIEW_TYPES, INTERVIEW_TYPE_LABELS, PLATFORMS, PLATFORM_LABELS } from '../domain/interviews'
import { zonedTimeToInstant, ymdOf, type Ymd } from '../domain/time'
import { useAsync } from '../hooks/useAsync'
import { useCurrentUser } from '../app/CurrentUser'
import { Button } from './ui/Button'
import { Field, SelectInput, TextArea, TextInput } from './ui/Field'
import { Modal } from './ui/Modal'

type CandidateOption = { id: string; name: string }

type Props = {
  candidates: CandidateOption[]
  /** Preselects a candidate, e.g. from their profile. */
  defaultCandidateId?: string
  /** Preselects a day/time, e.g. a clicked calendar slot. */
  defaultDay?: Ymd
  defaultHour?: number
  tz: string
  /** Edit this interview instead of creating one. */
  interview?: Interview
  onClose: () => void
  onSaved: (interview: Interview) => void
}

function toLocalInput(day: Ymd, hour: number): string {
  return `${day.y}-${String(day.m).padStart(2, '0')}-${String(day.d).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00`
}

/** Schedule a new interview, or edit the time/details of an existing one. */
export function ScheduleInterviewModal({ candidates, defaultCandidateId, defaultDay, defaultHour, tz, interview, onClose, onSaved }: Props) {
  const editing = interview !== undefined
  const { me } = useCurrentUser()
  const team = useAsync(() => listTeam(), [])
  const members = (team.data?.members ?? []).filter((m) => m.status === 'ACTIVE')

  const [candidateId, setCandidateId] = useState(interview?.candidate.id ?? defaultCandidateId ?? candidates[0]?.id ?? '')
  const [type, setType] = useState<InterviewType>(interview?.type ?? 'INITIAL')
  const [datetime, setDatetime] = useState(() => {
    if (interview) {
      const p = ymdOf(new Date(interview.startsAt), tz)
      const hour = new Date(interview.startsAt).toLocaleString('en-US', { timeZone: tz, hour12: false, hour: '2-digit' })
      return toLocalInput(p, Number(hour) % 24)
    }
    return toLocalInput(defaultDay ?? ymdOf(Date.now(), tz), defaultHour ?? 10)
  })
  const [duration, setDuration] = useState(interview?.durationMinutes ?? 45)
  const [platform, setPlatform] = useState<MeetingPlatform>(interview?.platform ?? 'GOOGLE_MEET')
  const [meetingLink, setMeetingLink] = useState(interview?.meetingLink ?? '')
  const [location, setLocation] = useState(interview?.location ?? '')
  const [notes, setNotes] = useState(interview?.notes ?? '')
  const [interviewerIds, setInterviewerIds] = useState<string[]>(interview?.interviewers.map((p) => p.id) ?? (me ? [me.id] : []))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const needsLocation = platform === 'ON_SITE'
  const needsLink = platform === 'ZOOM' || platform === 'GOOGLE_MEET'

  const startsAtIso = useMemo(() => {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(datetime)
    if (!match) return null
    const [, y, m, d, hh, mm] = match
    return zonedTimeToInstant({ y: Number(y), m: Number(m), d: Number(d) }, Number(hh), Number(mm), tz).toISOString()
  }, [datetime, tz])

  function toggleInterviewer(id: string) {
    setInterviewerIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return

    const local: Record<string, string> = {}
    if (!editing && !candidateId) local.candidateId = 'Choose a candidate.'
    if (!startsAtIso) local.startsAt = 'Enter a valid date and time.'
    if (needsLink && !meetingLink.trim()) local.meetingLink = 'Add a meeting link.'
    if (needsLocation && !location.trim()) local.location = 'Add a location.'
    if (interviewerIds.length === 0) local.interviewerIds = 'Choose at least one interviewer.'
    setErrors(local)
    setFormError(null)
    if (Object.keys(local).length > 0 || !startsAtIso) return

    setSaving(true)
    try {
      const shared = {
        type,
        startsAt: startsAtIso,
        durationMinutes: duration,
        platform,
        meetingLink: needsLink ? meetingLink.trim() : null,
        location: needsLocation ? location.trim() : null,
        notes: notes.trim() || null,
        interviewerIds,
      }
      const saved = editing
        ? await updateInterview(interview.id, shared)
        : await scheduleInterview({ candidateId, ...shared } as ScheduleInterviewInput)
      onSaved(saved)
    } catch (err) {
      const fields = fieldErrorsOf(err)
      setErrors(fields)
      if (Object.keys(fields).length === 0) setFormError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal title={editing ? 'Reschedule interview' : 'Schedule interview'} onClose={onClose} dismissable={!saving} size="md">
      <form onSubmit={(e) => void submit(e)} noValidate className="mt-5 space-y-4">
        {!editing && (
          <Field label="Candidate" required error={errors.candidateId}>
            {(p) => (
              <SelectInput {...p} value={candidateId} onChange={(e) => setCandidateId(e.target.value)} disabled={candidates.length === 0}>
                <option value="" disabled>Choose a candidate…</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </SelectInput>
            )}
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Interview type" error={errors.type}>
            {(p) => (
              <SelectInput {...p} value={type} onChange={(e) => setType(e.target.value as InterviewType)}>
                {INTERVIEW_TYPES.map((t) => (
                  <option key={t} value={t}>{INTERVIEW_TYPE_LABELS[t]}</option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Duration" error={errors.durationMinutes}>
            {(p) => (
              <SelectInput {...p} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d} minutes</option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Date & time" required error={errors.startsAt} hint={`In your calendar’s time zone.`} className="sm:col-span-2">
            {(p) => <TextInput {...p} type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} />}
          </Field>
          <Field label="Platform" error={errors.platform}>
            {(p) => (
              <SelectInput {...p} value={platform} onChange={(e) => setPlatform(e.target.value as MeetingPlatform)}>
                {PLATFORMS.map((pl) => (
                  <option key={pl} value={pl}>{PLATFORM_LABELS[pl]}</option>
                ))}
              </SelectInput>
            )}
          </Field>
          {needsLink && (
            <Field label="Meeting link" required error={errors.meetingLink}>
              {(p) => <TextInput {...p} value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://…" />}
            </Field>
          )}
          {needsLocation && (
            <Field label="Location" required error={errors.location}>
              {(p) => <TextInput {...p} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Acme HQ, New Delhi" />}
            </Field>
          )}
        </div>

        <Field label="Interviewers" required error={errors.interviewerIds}>
          {() => (
            <div className="flex flex-wrap gap-2">
              {members.map((m) => {
                const on = interviewerIds.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleInterviewer(m.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
                      on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-700 ring-line-strong hover:bg-tint'
                    }`}
                  >
                    {m.name}
                  </button>
                )
              })}
            </div>
          )}
        </Field>

        <Field label="Notes" error={errors.notes}>
          {(p) => <TextArea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What to focus on, anything to prepare." maxLength={2000} />}
        </Field>

        {formError && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving} loadingLabel={editing ? 'Saving…' : 'Scheduling…'}>
            {editing ? 'Save changes' : 'Schedule interview'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
