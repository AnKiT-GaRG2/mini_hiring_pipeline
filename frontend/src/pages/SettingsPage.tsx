import { Building2, ImagePlus, MapPin, UserRound } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { getCompany, saveCompany } from '../api/team'
import { errorMessage, fieldErrorsOf } from '../api/http'
import { updateMe } from '../api/team'
import type { CompanyProfile } from '../api/types'
import { useCurrentUser } from '../app/CurrentUser'
import { useSearchParams } from '../app/router'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field, SelectInput, TextArea, TextInput } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import { ErrorState, LoadingBlock } from '../components/ui/StatusViews'
import { useAsync } from '../hooks/useAsync'
import { useToast } from '../hooks/useToast'

type Tab = 'company' | 'me'

const DESCRIPTION_MAX = 500

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Couldn’t read that file.'))
    reader.readAsDataURL(file)
  })
}

function ImagePicker({ label, hint, maxBytes, value, onChange, shape }: {
  label: string
  hint: string
  maxBytes: number
  value: string | null
  onChange: (dataUrl: string | null) => void
  shape: 'square' | 'wide'
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast.error(`${label} must be a PNG, JPG or WebP image.`)
      return
    }
    const dataUrl = await readAsDataUrl(file)
    if (dataUrl.length > maxBytes) {
      toast.error(`${label} is too large. Pick a smaller image.`)
      return
    }
    onChange(dataUrl)
  }

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-ink-800">{label}</p>
      <div className="flex items-center gap-3">
        <div className={`flex shrink-0 items-center justify-center overflow-hidden border border-line bg-tint ${shape === 'square' ? 'h-16 w-16 rounded-xl' : 'h-16 w-28 rounded-xl'}`}>
          {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5 text-ink-300" aria-hidden="true" />}
        </div>
        <div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => inputRef.current?.click()}>
              {value ? `Change ${label}` : `Upload ${label}`}
            </Button>
            {value && <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Remove</Button>}
          </div>
          <p className="mt-1 text-xs text-ink-400">{hint}</p>
        </div>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void onPick(e)} />
      </div>
    </div>
  )
}

function CompanyDetailsForm({ company, onSaved }: { company: CompanyProfile; onSaved: (c: CompanyProfile) => void }) {
  const { can } = useCurrentUser()
  const canEdit = can('company:edit')
  const toast = useToast()

  const [name, setName] = useState(company.name)
  const [website, setWebsite] = useState(company.website ?? '')
  const [industry, setIndustry] = useState(company.industry ?? '')
  const [size, setSize] = useState(company.size ?? '')
  const [location, setLocation] = useState(company.location ?? '')
  const [description, setDescription] = useState(company.description ?? '')
  const [logo, setLogo] = useState<string | null>(company.logoDataUrl)
  const [cover, setCover] = useState<string | null>(company.coverDataUrl)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving || !canEdit) return
    if (!name.trim()) {
      setErrors({ name: 'Company name is required.' })
      return
    }
    setErrors({})
    setFormError(null)
    setSaving(true)
    try {
      const saved = await saveCompany({
        name: name.trim(),
        website: website.trim() || null,
        industry: industry || null,
        size: size || null,
        location: location.trim() || null,
        description: description.trim() || null,
        logoDataUrl: logo,
        coverDataUrl: cover,
      })
      onSaved({ ...saved, options: company.options })
      toast.success('Saved company details.')
    } catch (err) {
      const fields = fieldErrorsOf(err)
      setErrors(fields)
      if (Object.keys(fields).length === 0) setFormError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink-950">Company Details</h2>
        <p className="mt-1 text-sm text-ink-500">Update your company information and branding.</p>

        <form onSubmit={(e) => void submit(e)} noValidate className="mt-5 space-y-6">
          <fieldset disabled={!canEdit} className="space-y-5 disabled:opacity-70">
            <div>
              <h3 className="text-sm font-semibold text-ink-950">Basic Information</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label="Company Name" required error={errors.name}>
                  {(p) => <TextInput {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />}
                </Field>
                <Field label="Website" error={errors.website}>
                  {(p) => <TextInput {...p} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://acme.com" maxLength={300} />}
                </Field>
                <Field label="Industry" error={errors.industry}>
                  {(p) => (
                    <SelectInput {...p} value={industry} onChange={(e) => setIndustry(e.target.value)}>
                      <option value="">Not set</option>
                      {company.options.industries.map((i) => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                    </SelectInput>
                  )}
                </Field>
                <Field label="Company Size" error={errors.size}>
                  {(p) => (
                    <SelectInput {...p} value={size} onChange={(e) => setSize(e.target.value)}>
                      <option value="">Not set</option>
                      {company.options.sizes.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </SelectInput>
                  )}
                </Field>
                <Field label="Location" error={errors.location} className="sm:col-span-2">
                  {(p) => <TextInput {...p} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="New Delhi, India" maxLength={150} />}
                </Field>
              </div>
            </div>

            <div className="border-t border-line pt-5">
              <h3 className="text-sm font-semibold text-ink-950">About Company</h3>
              <Field label="Description" error={errors.description} className="mt-3" hint={`${description.length}/${DESCRIPTION_MAX}`}>
                {(p) => <TextArea {...p} value={description} onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))} maxLength={DESCRIPTION_MAX} />}
              </Field>
            </div>

            <div className="border-t border-line pt-5">
              <h3 className="text-sm font-semibold text-ink-950">Branding</h3>
              <div className="mt-3 grid gap-5 sm:grid-cols-2">
                <ImagePicker label="Company Logo" hint="Recommended: 200×200 (PNG, JPG)" maxBytes={400_000} value={logo} onChange={setLogo} shape="square" />
                <ImagePicker label="Cover Image" hint="Recommended: 1200×400 (PNG, JPG)" maxBytes={1_500_000} value={cover} onChange={setCover} shape="wide" />
              </div>
            </div>
          </fieldset>

          {formError && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {formError}
            </p>
          )}

          {canEdit && (
            <div className="flex justify-end border-t border-line pt-4">
              <Button type="submit" variant="primary" loading={saving} loadingLabel="Saving…">
                Save Changes
              </Button>
            </div>
          )}
        </form>
      </Card>

      <aside className="space-y-4">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            {logo ? <img src={logo} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-line object-cover" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Building2 className="h-5 w-5" /></span>}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-950">{name || 'Company name'}</p>
              {website && <p className="truncate text-xs text-brand-600">{website}</p>}
            </div>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-ink-400">Industry</dt>
              <dd className="text-ink-800">{industry || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-400">Company Size</dt>
              <dd className="text-ink-800">{size || '—'}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-ink-400"><MapPin className="h-3 w-3" /> Location</dt>
              <dd className="text-ink-800">{location || '—'}</dd>
            </div>
          </dl>
        </Card>
        <p className="rounded-xl bg-brand-50 px-4 py-3 text-xs leading-relaxed text-brand-800">
          This information will be visible to candidates on your career page and in communications.
        </p>
      </aside>
    </div>
  )
}

function MyDetailsForm() {
  const { me, refresh } = useCurrentUser()
  const toast = useToast()
  const [name, setName] = useState(me.name)
  const [email, setEmail] = useState(me.email)
  const [phone, setPhone] = useState(me.phone ?? '')
  const [location, setLocation] = useState(me.location ?? '')
  const [jobTitle, setJobTitle] = useState(me.jobTitle ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!name.trim() || !email.trim()) {
      setErrors({ ...(name.trim() ? {} : { name: 'Name is required.' }), ...(email.trim() ? {} : { email: 'Email is required.' }) })
      return
    }
    setErrors({})
    setFormError(null)
    setSaving(true)
    try {
      await updateMe({ name: name.trim(), email: email.trim(), phone: phone.trim() || null, location: location.trim() || null, jobTitle: jobTitle.trim() || null })
      await refresh()
      toast.success('Saved your details.')
    } catch (err) {
      const fields = fieldErrorsOf(err)
      setErrors(fields)
      if (Object.keys(fields).length === 0) setFormError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="max-w-2xl p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <Avatar name={me.name} size="xl" />
        <div>
          <h2 className="text-base font-semibold text-ink-950">My Details</h2>
          <p className="text-sm text-ink-500">How your teammates see you.</p>
        </div>
      </div>

      <form onSubmit={(e) => void submit(e)} noValidate className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.name}>
            {(p) => <TextInput {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />}
          </Field>
          <Field label="Email" required error={errors.email}>
            {(p) => <TextInput {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />}
          </Field>
          <Field label="Job title" error={errors.jobTitle}>
            {(p) => <TextInput {...p} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={100} />}
          </Field>
          <Field label="Phone" error={errors.phone}>
            {(p) => <TextInput {...p} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={50} />}
          </Field>
          <Field label="Location" error={errors.location} className="sm:col-span-2">
            {(p) => <TextInput {...p} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={150} />}
          </Field>
        </div>

        {formError && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {formError}
          </p>
        )}

        <div className="flex justify-end border-t border-line pt-4">
          <Button type="submit" variant="primary" loading={saving} loadingLabel="Saving…">
            Save Changes
          </Button>
        </div>
      </form>
    </Card>
  )
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'me' ? 'me' : 'company'
  const company = useAsync(() => getCompany(), [])
  const [saved, setSaved] = useState<CompanyProfile | null>(null)
  const current = saved ?? company.data

  const item = (id: Tab, label: string, Icon: typeof Building2) => (
    <button
      type="button"
      onClick={() => setParams({ tab: id === 'company' ? undefined : id })}
      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors ${
        tab === id ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-tint'
      }`}
    >
      <span className="flex items-center gap-2.5">
        <Icon className="h-4 w-4" aria-hidden="true" /> {label}
      </span>
    </button>
  )

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Settings" subtitle="Manage your account and company details." />

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="space-y-1">
          {item('company', 'Company Details', Building2)}
          {item('me', 'My Details', UserRound)}
        </nav>

        <div>
          {tab === 'company' &&
            (company.loading && !current ? (
              <LoadingBlock label="Loading company details…" />
            ) : company.error && !current ? (
              <ErrorState message={company.error} onRetry={company.reload} />
            ) : current ? (
              <CompanyDetailsForm company={current} onSaved={setSaved} />
            ) : null)}
          {tab === 'me' && <MyDetailsForm />}
        </div>
      </div>
    </div>
  )
}
