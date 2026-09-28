import { Button } from './Button'
import { SearchBox } from './SearchBox'

type Props = {
  searchText: string
  onSearchTextChange: (value: string) => void
  onSearch: (query: string) => void
  onClearSearch: () => void
  searching: boolean
  onAddCandidate: () => void
}

export function Header({ searchText, onSearchTextChange, onSearch, onClearSearch, searching, onAddCandidate }: Props) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Hiring Pipeline</h1>
        <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-2xl">
          <SearchBox
            value={searchText}
            onChange={onSearchTextChange}
            onSearch={onSearch}
            onClear={onClearSearch}
            searching={searching}
          />
        </div>
        <Button variant="primary" className="ml-auto" onClick={onAddCandidate}>
          + Add candidate
        </Button>
      </div>
    </header>
  )
}
