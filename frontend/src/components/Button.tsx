import type { ButtonHTMLAttributes } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'danger' | 'dangerSolid' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline-indigo-600',
  secondary:
    'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-indigo-600',
  danger:
    'bg-white text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 focus-visible:outline-rose-600',
  dangerSolid: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600',
  ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:outline-indigo-600',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'sm' | 'md'
  loading?: boolean
  loadingLabel?: string
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  loadingLabel,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: Props) {
  const sizing = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${sizing} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  )
}
