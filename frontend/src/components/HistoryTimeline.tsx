import { STAGE_STYLES } from '../domain/stages'
import { formatEventDate, formatEventTime, type TimelineEntry } from '../domain/history'

/**
 * Read-only, oldest first. Purely presentational: it renders the entries it is
 * given and offers no way to change them.
 */
export function HistoryTimeline({ entries, now }: { entries: TimelineEntry[]; now: number }) {
  return (
    <ol aria-label="Stage history" className="relative">
      {entries.map((entry, index) => (
        <li key={entry.key} className="relative flex gap-4 pb-6 last:pb-0">
          {index < entries.length - 1 && (
            <span className="absolute top-3 bottom-0 left-[5px] w-px bg-slate-200" aria-hidden="true" />
          )}
          <span
            className={`relative z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-4 ring-white ${
              STAGE_STYLES[entry.stage].dot
            }`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <time dateTime={entry.at} className="block text-sm font-semibold text-slate-900">
              {formatEventDate(entry.at, now)}
              <span className="ml-2 text-xs font-normal text-slate-500">{formatEventTime(entry.at)}</span>
            </time>
            <p className="text-sm text-slate-700">
              {entry.text}
              {entry.isCurrent && (
                <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                  Current
                </span>
              )}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
