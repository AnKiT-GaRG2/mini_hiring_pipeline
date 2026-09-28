import { useId, type FormEvent } from 'react'
import { Button } from './Button'

type Props = {
  value: string
  onChange: (value: string) => void
  onSearch: (query: string) => void
  onClear: () => void
  searching: boolean
}

export function SearchBox({ value, onChange, onSearch, onClear, searching }: Props) {
  const inputId = useId()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSearch(value)
  }

  return (
    <form role="search" onSubmit={handleSubmit} className="flex w-full gap-2">
      <label htmlFor={inputId} className="sr-only">
        Search candidates
      </label>
      <div className="relative flex-1">
        <input
          id={inputId}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search candidates — try “Priya in Screening”"
          autoComplete="off"
          className="w-full rounded-lg border-0 bg-white py-2 pl-3 pr-9 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-lg text-slate-400 hover:text-slate-700"
          >
            ×
          </button>
        )}
      </div>
      <Button type="submit" variant="secondary" loading={searching} loadingLabel="Searching…">
        Search
      </Button>
    </form>
  )
}
