import { useState, type FormEvent } from 'react'
import { errorMessage, fieldErrorsOf } from '../api/http'
import { createJob, updateJob } from '../api/jobs'
import type { EmploymentType, Job, JobInput, JobStatus, WorkMode } from '../api/types'
import { EMPLOYMENT_LABELS, JOB_STATUS_LABELS, WORK_MODE_LABELS } from '../domain/jobs'
import { Button } from './ui/Button'
import { Field, SelectInput, TextArea, TextInput } from './ui/Field'
import { Modal } from './ui/Modal'

type Props = {
  /** Edit this job; omit to create a new one. */
  job?: Job
  onClose: () => void
  onSaved: (job: Job) => void
}

/** Create or edit a job. Errors from the server are shown next to the field they belong to. */
export function JobFormModal({ job, onClose, onSaved }: Props) {
  const editing = job !== undefined
  const [title, setTitle] = useState(job?.title ?? '')
  const [department, setDepartment] = useState(job?.department ?? '')
  const [location, setLocation] = useState(job?.location ?? '')
  const [workMode, setWorkMode] = useState<WorkMode>(job?.workMode ?? 'ON_SITE')
  const [employmentType, setEmploymentType] = useState<EmploymentType>(job?.employmentType ?? 'FULL_TIME')
  const [openings, setOpenings] = useState(String(job?.openings ?? 1))
  const [status, setStatus] = useState<JobStatus>(job?.status ?? 'OPEN')
  const [description, setDescription] = useState(job?.description ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return

    const local: Record<string, string> = {}
    if (!title.trim()) local.title = 'Give the job a title.'
    const count = Number(openings)
    if (!Number.isInteger(count) || count < 1) local.openings = 'Enter a whole number, 1 or more.'
    setErrors(local)
    setFormError(null)
    if (Object.keys(local).length > 0) return

    const input: JobInput = {
      title: title.trim(),
      department: department.trim(),
      location: location.trim(),
      workMode,
      employmentType,
      openings: count,
      description: description.trim(),
      ...(editing ? { status } : {}),
    }

    setSaving(true)
    try {
      const saved = editing ? await updateJob(job.id, input) : await createJob(input)
      onSaved(saved)
    } catch (err) {
      const fields = fieldErrorsOf(err)
      setErrors(fields)
      if (Object.keys(fields).length === 0) setFormError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal title={editing ? 'Edit job' : 'Create a new job'} description={editing ? undefined : 'Open a position and start receiving candidates.'} onClose={onClose} dismissable={!saving}>
      <form onSubmit={(e) => void submit(e)} noValidate className="mt-5 space-y-4">
        <Field label="Job title" required error={errors.title}>
          {(p) => <TextInput {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Frontend Developer" autoFocus maxLength={150} />}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Department" error={errors.department}>
            {(p) => <TextInput {...p} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Engineering" maxLength={100} />}
          </Field>
          <Field label="Location" error={errors.location}>
            {(p) => <TextInput {...p} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="New Delhi, India" maxLength={150} />}
          </Field>
          <Field label="Work mode" error={errors.workMode}>
            {(p) => (
              <SelectInput {...p} value={workMode} onChange={(e) => setWorkMode(e.target.value as WorkMode)}>
                {(Object.keys(WORK_MODE_LABELS) as WorkMode[]).map((m) => (
                  <option key={m} value={m}>{WORK_MODE_LABELS[m]}</option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Employment type" error={errors.employmentType}>
            {(p) => (
              <SelectInput {...p} value={employmentType} onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}>
                {(Object.keys(EMPLOYMENT_LABELS) as EmploymentType[]).map((t) => (
                  <option key={t} value={t}>{EMPLOYMENT_LABELS[t]}</option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Openings" error={errors.openings} hint="How many people you want to hire.">
            {(p) => <TextInput {...p} type="number" inputMode="numeric" min={1} value={openings} onChange={(e) => setOpenings(e.target.value)} />}
          </Field>
          {editing && (
            <Field label="Status" error={errors.status}>
              {(p) => (
                <SelectInput {...p} value={status} onChange={(e) => setStatus(e.target.value as JobStatus)}>
                  {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map((s) => (
                    <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>
                  ))}
                </SelectInput>
              )}
            </Field>
          )}
        </div>

        <Field label="Description" error={errors.description}>
          {(p) => <TextArea {...p} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What will this person do?" maxLength={5000} />}
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
          <Button type="submit" variant="primary" loading={saving} loadingLabel={editing ? 'Saving…' : 'Creating…'}>
            {editing ? 'Save changes' : 'Create job'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
