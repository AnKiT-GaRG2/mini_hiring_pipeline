import { SEARCH_HELP } from '../domain/searchSummary'
import { Button } from './Button'

type Props = {
  /** A name the search looked for and didn't find, when that was all it understood. */
  lookedForName?: string
  /** Anything specific the backend said (e.g. an unknown stage) beyond the generic sentence. */
  detail?: string
  onShowAll: () => void
}

/** Shown whenever a search can't be understood — says so, and shows what would work. */
export function SearchHelp({ lookedForName, detail, onShowAll }: Props) {
  return (
    <div role="status" className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-lg font-semibold text-slate-900">I couldn’t understand that search.</h2>

      {lookedForName && (
        <p className="mt-2 text-sm text-slate-600">
          I looked for a candidate named <strong>“{lookedForName}”</strong> but nobody matches, and I couldn’t read it
          as a stage, time-in-stage, movement or hiring-outcome search either.
        </p>
      )}
      {detail && <p className="mt-2 text-sm text-slate-600">{detail}</p>}

      <p className="mt-5 text-sm font-medium text-slate-800">Try searching by:</p>
      <ul className="mt-2 space-y-2">
        {SEARCH_HELP.map(({ topic, example }) => (
          <li key={topic} className="flex gap-2 text-sm">
            <span className="text-slate-400" aria-hidden="true">
              •
            </span>
            <span>
              <span className="font-medium text-slate-800">{topic}</span>
              <span className="text-slate-500"> — {example}</span>
            </span>
          </li>
        ))}
      </ul>

      <Button className="mt-6" onClick={onShowAll}>
        Show all candidates
      </Button>
    </div>
  )
}
