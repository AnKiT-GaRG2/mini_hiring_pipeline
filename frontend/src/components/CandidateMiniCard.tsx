import { Clock, MoreHorizontal } from 'lucide-react'
import type { Candidate } from '../api/types'
import { useNavigate } from '../app/router'
import { skillTone } from '../domain/candidates'
import { timeAgo } from '../domain/format'
import { Avatar } from './ui/Avatar'

/** The compact card used in the Home page's pipeline columns. */
export function CandidateMiniCard({ candidate, now }: { candidate: Candidate; now: number }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate(`/candidates?open=${encodeURIComponent(candidate.id)}`)}
      className="group flex w-full items-start gap-3 rounded-xl border border-line bg-white p-3 text-left transition-colors hover:border-brand-200 hover:bg-brand-50/40"
    >
      <Avatar name={candidate.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-ink-950">{candidate.name}</p>
        <p className="truncate text-xs text-ink-500">{candidate.email}</p>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-400">
          <Clock className="h-3 w-3" aria-hidden="true" /> {timeAgo(candidate.updatedAt, now)}
        </p>
        {candidate.skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {candidate.skills.slice(0, 2).map((skill) => (
              <span key={skill} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${skillTone(skill)}`}>
                {skill}
              </span>
            ))}
          </div>
        )}
      </div>
      <MoreHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-ink-300 opacity-0 group-hover:opacity-100" aria-hidden="true" />
    </button>
  )
}
