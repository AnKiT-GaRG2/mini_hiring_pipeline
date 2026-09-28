import { useState, type FormEvent } from 'react'
import { addMember, updateMember } from '../api/team'
import { errorMessage, fieldErrorsOf } from '../api/http'
import type { Role, TeamMember } from '../api/types'
import { useCurrentUser } from '../app/CurrentUser'
import { ROLE_LABELS, ROLES } from '../domain/roles'
import { Button } from './ui/Button'
import { Field, SelectInput, TextInput } from './ui/Field'
import { Modal } from './ui/Modal'

type Props = {
  /** Edit this member instead of adding one. */
  member?: TeamMember
  onClose: () => void
  onSaved: (member: TeamMember) => void
}

export function TeamFormModal({ member, onClose, onSaved }: Props) {
  const { can } = useCurrentUser()
  const canAssignAdmin = can('admin:assign')
  const editing = member !== undefined

  const [name, setName] = useState(member?.name ?? '')
  const [email, setEmail] = useState(member?.email ?? '')
  const [jobTitle, setJobTitle] = useState(member?.jobTitle ?? '')
  const [role, setRole] = useState<Role>(member?.role ?? 'RECRUITER')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const roleOptions = ROLES.filter((r) => r !== 'ADMIN' || canAssignAdmin || member?.role === 'ADMIN')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return

    const local: Record<string, string> = {}
    if (!name.trim()) local.name = 'Enter their name.'
    if (!editing && !email.trim()) local.email = 'Enter their email address.'
    setErrors(local)
    setFormError(null)
    if (Object.keys(local).length > 0) return

    setSaving(true)
    try {
      const saved = editing
        ? await updateMember(member.id, { name: name.trim(), role, jobTitle: jobTitle.trim() || null })
        : await addMember({ name: name.trim(), email: email.trim(), role, jobTitle: jobTitle.trim() || null })
      onSaved(saved)
    } catch (err) {
      const fields = fieldErrorsOf(err)
      setErrors(fields)
      if (Object.keys(fields).length === 0) setFormError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal title={editing ? 'Edit team member' : 'Add Member'} description={editing ? undefined : 'Invite someone to the hiring team.'} onClose={onClose} dismissable={!saving}>
      <form onSubmit={(e) => void submit(e)} noValidate className="mt-5 space-y-4">
        <Field label="Full name" required error={errors.name}>
          {(p) => <TextInput {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" autoFocus maxLength={150} />}
        </Field>
        <Field label="Email" required error={errors.email} hint={editing ? 'Email can’t be changed here.' : undefined}>
          {(p) => <TextInput {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@example.com" disabled={editing} maxLength={254} />}
        </Field>
        <Field label="Job title" error={errors.jobTitle}>
          {(p) => <TextInput {...p} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Senior Recruiter" maxLength={100} />}
        </Field>
        <Field label="Role" required error={errors.role}>
          {(p) => (
            <SelectInput {...p} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {roleOptions.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </SelectInput>
          )}
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
          <Button type="submit" variant="primary" loading={saving} loadingLabel={editing ? 'Saving…' : 'Adding…'}>
            {editing ? 'Save changes' : 'Add Member'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
