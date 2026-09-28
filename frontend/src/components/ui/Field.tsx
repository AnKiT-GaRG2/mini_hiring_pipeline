import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

export const inputClass =
  'block h-10 w-full rounded-[10px] border border-line-strong bg-white px-3 text-sm text-ink-950 placeholder:text-ink-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-tint disabled:text-ink-500 aria-[invalid=true]:border-rose-400'

type FieldProps = {
  label: string
  error?: string | null
  hint?: ReactNode
  required?: boolean
  className?: string
  children: (props: { id: string; 'aria-invalid': boolean | undefined; 'aria-describedby': string | undefined }) => ReactNode
}

/** A label, the control, and its error or hint — wired together for screen readers. */
export function Field({ label, error, hint, required, className = '', children }: FieldProps) {
  const id = useId()
  const noteId = `${id}-note`
  const note = error ?? hint
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-800">
        {label}
        {required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': note ? noteId : undefined })}
      {note && (
        <p id={noteId} className={`mt-1.5 text-xs ${error ? 'text-rose-600' : 'text-ink-500'}`} role={error ? 'alert' : undefined}>
          {note}
        </p>
      )}
    </div>
  )
}

export function TextInput({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${className}`} {...rest} />
}

export function TextArea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputClass} h-auto min-h-24 resize-y py-2.5 leading-relaxed ${className}`} {...rest} />
}

/** A native <select> (so it is accessible and keyboard-friendly for free) with the design's chevron and optional leading icon. */
export function SelectInput({
  icon,
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { icon?: ReactNode }) {
  return (
    <div className={`relative ${className}`}>
      {icon && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-400">{icon}</span>}
      <select className={`${inputClass} appearance-none pr-9 ${icon ? 'pl-10' : ''}`} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
    </div>
  )
}
