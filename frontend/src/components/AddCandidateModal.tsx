import { useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { ApiError } from '../api/http'
import type { CreateCandidateInput } from '../api/types'
import { Button } from './Button'
import { Modal } from './Modal'

type Props = {
  /** Resolves on success; rejects with an ApiError to show server-side feedback. */
  onSubmit: (input: CreateCandidateInput) => Promise<void>
  onClose: () => void
}

type Fields = 'name' | 'email' | 'phone'
type Errors = Partial<Record<Fields | 'form', string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(name: string, email: string, phone: string): Errors {
  const errors: Errors = {}
  if (!name.trim()) errors.name = 'Name is required.'
  else if (name.trim().length > 200) errors.name = 'Name must be 200 characters or fewer.'

  if (!email.trim()) errors.email = 'Email is required.'
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.'

  if (phone.trim().length > 50) errors.phone = 'Phone must be 50 characters or fewer.'
  return errors
}

/** Maps a server rejection back onto the field it is about. */
function errorsFromApi(err: unknown): Errors {
  if (!(err instanceof ApiError)) return { form: 'Something went wrong. Please try again.' }
  if (err.status === 409) return { email: err.message }

  if (err.status === 400 && err.details?.length) {
    const errors: Errors = {}
    for (const issue of err.details) {
      const field = (['name', 'email', 'phone'] as const).find((f) => f === issue.path)
      if (field) errors[field] ??= issue.message
      else errors.form ??= issue.message
    }
    return errors
  }
  return { form: err.message }
}

function Field({
  id,
  label,
  error,
  optional,
  ...input
}: {
  id: string
  label: string
  error?: string
  optional?: boolean
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label} {optional && <span className="font-normal text-slate-400">(optional)</span>}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-1 w-full rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-inset focus:ring-2 focus:outline-none ${
          error ? 'ring-rose-400 focus:ring-rose-600' : 'ring-slate-300 focus:ring-indigo-600'
        }`}
        {...input}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  )
}

export function AddCandidateModal({ onSubmit, onClose }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)

  function edit(field: Fields, set: (v: string) => void) {
    return (value: string) => {
      set(value)
      setErrors((prev) => ({ ...prev, [field]: undefined, form: undefined }))
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return

    const found = validate(name, email, phone)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSubmitting(true)
    try {
      await onSubmit({ name: name.trim(), email: email.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) })
    } catch (err) {
      setErrors(errorsFromApi(err))
      setSubmitting(false)
    }
    // On success the parent unmounts this modal, so there is nothing to reset.
  }

  return (
    <Modal title="Add candidate" onClose={onClose} dismissable={!submitting}>
      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
        <Field
          id="candidate-name"
          label="Name"
          value={name}
          onChange={(e) => edit('name', setName)(e.target.value)}
          error={errors.name}
          autoComplete="off"
          autoFocus
        />
        <Field
          id="candidate-email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => edit('email', setEmail)(e.target.value)}
          error={errors.email}
          autoComplete="off"
        />
        <Field
          id="candidate-phone"
          label="Phone"
          type="tel"
          optional
          value={phone}
          onChange={(e) => edit('phone', setPhone)(e.target.value)}
          error={errors.phone}
          autoComplete="off"
        />

        {errors.form && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {errors.form}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting} loadingLabel="Adding…">
            Add candidate
          </Button>
        </div>
      </form>
    </Modal>
  )
}
