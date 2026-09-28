import { SEARCH_HELP } from '../domain/searchSummary'
import { Button } from './ui/Button'

type Props = {
  lookedForName?: string
  detail?: string
  onShowAll: () => void
}

/** Shown whenever a natural-language search can't be understood — says so, and shows what would work. */
export function SearchHelp({ lookedForName, detail, onShowAll }: Props) {
  return (
    <div role="status" className="mx-auto max-w-xl rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
      <h2 className="text-lg font-semibold text-ink-950">I couldn’t understand that search.</h2>

      {lookedForName && (
        <p className="mt-2 text-sm text-ink-600">
          I looked for a candidate named <strong>“{lookedForName}”</strong> but nobody matches, and I couldn’t read it
          as a stage, time-in-stage, movement or hiring-outcome search either.
        </p>
      )}
      {detail && <p className="mt-2 text-sm text-ink-600">{detail}</p>}

      <p className="mt-5 text-sm font-medium text-ink-800">Try searching by:</p>
      <ul className="mt-2 space-y-2">
        {SEARCH_HELP.map(({ topic, example }) => (
          <li key={topic} className="flex gap-2 text-sm">
            <span className="text-ink-400" aria-hidden="true">•</span>
            <span>
              <span className="font-medium text-ink-800">{topic}</span>
              <span className="text-ink-500"> — {example}</span>
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
