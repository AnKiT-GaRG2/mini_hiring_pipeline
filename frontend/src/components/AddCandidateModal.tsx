import { useState, type FormEvent } from 'react'
import { createCandidate } from '../api/candidates'
import { errorMessage, fieldErrorsOf } from '../api/http'
import type { CandidateDetail, CandidateSource, Job } from '../api/types'
import { CANDIDATE_SOURCE_LABELS } from '../domain/candidates'
import { Button } from './ui/Button'
import { Field, SelectInput, TextArea, TextInput } from './ui/Field'
import { Modal } from './ui/Modal'

type Props = {
  jobs: Job[]
  /** Preselects a job, e.g. when adding from that job's page. */
  defaultJobId?: string
  onClose: () => void
  onCreated: (candidate: CandidateDetail) => void
}

const openJobs = (jobs: Job[]) => jobs.filter((j) => j.status === 'OPEN')

/** Add a candidate: the essentials up front, skills as a quick comma-separated list. */
export function AddCandidateModal({ jobs, defaultJobId, onClose, onCreated }: Props) {
  const available = openJobs(jobs)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [jobId, setJobId] = useState(defaultJobId && available.some((j) => j.id === defaultJobId) ? defaultJobId : (available[0]?.id ?? ''))
  const [location, setLocation] = useState('')
  const [source, setSource] = useState<CandidateSource>('CAREER_PAGE')
  const [years, setYears] = useState('0')
  const [skillsText, setSkillsText] = useState('')
  const [summary, setSummary] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return

    const local: Record<string, string> = {}
    if (!name.trim()) local.name = 'Enter the candidate’s name.'
    if (!email.trim()) local.email = 'Enter an email address.'
    if (!jobId) local.jobId = 'Choose which job they applied to.'
    setErrors(local)
    setFormError(null)
    if (Object.keys(local).length > 0) return

    setSaving(true)
    try {
      const created = await createCandidate({
        name: name.trim(),
        email: email.trim(),
        jobId,
        phone: phone.trim() || null,
        location: location.trim() || null,
        source,
        yearsOfExperience: Number(years) || 0,
        summary: summary.trim() || null,
        skills: skillsText.split(',').map((s) => s.trim()).filter(Boolean),
      })
      onCreated(created)
    } catch (err) {
      const fields = fieldErrorsOf(err)
      setErrors(fields)
      if (Object.keys(fields).length === 0) setFormError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal title="Add Candidate" description="They’ll appear in the Applied column of the job you choose." onClose={onClose} dismissable={!saving}>
      <form onSubmit={(e) => void submit(e)} noValidate className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.name}>
            {(p) => <TextInput {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" autoFocus maxLength={200} />}
          </Field>
          <Field label="Email" required error={errors.email}>
            {(p) => <TextInput {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@example.com" maxLength={254} />}
          </Field>
          <Field label="Phone" error={errors.phone}>
            {(p) => <TextInput {...p} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 90000 00000" maxLength={50} />}
          </Field>
          <Field label="Location" error={errors.location}>
            {(p) => <TextInput {...p} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Bengaluru, India" maxLength={150} />}
          </Field>

          <Field label="Applying for" required error={errors.jobId} hint={available.length === 0 ? 'No open jobs — open one on the Jobs page first.' : undefined}>
            {(p) => (
              <SelectInput {...p} value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={available.length === 0}>
                <option value="" disabled>Choose a job…</option>
                {available.map((j) => (
                  <option key={j.id} value={j.id}>{j.title}</option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Source" error={errors.source}>
            {(p) => (
              <SelectInput {...p} value={source} onChange={(e) => setSource(e.target.value as CandidateSource)}>
                {(Object.keys(CANDIDATE_SOURCE_LABELS) as CandidateSource[]).map((s) => (
                  <option key={s} value={s}>{CANDIDATE_SOURCE_LABELS[s]}</option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Years of experience" error={errors.yearsOfExperience}>
            {(p) => <TextInput {...p} type="number" inputMode="numeric" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)} />}
          </Field>
          <Field label="Skills" error={errors.skills} hint="Comma-separated.">
            {(p) => <TextInput {...p} value={skillsText} onChange={(e) => setSkillsText(e.target.value)} placeholder="React, Node.js, TypeScript" />}
          </Field>
        </div>

        <Field label="Summary" error={errors.summary}>
          {(p) => <TextArea {...p} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="A short note on their background." maxLength={2000} />}
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
          <Button type="submit" variant="primary" loading={saving} loadingLabel="Adding…" disabled={available.length === 0}>
            Add Candidate
          </Button>
        </div>
      </form>
    </Modal>
  )
}
