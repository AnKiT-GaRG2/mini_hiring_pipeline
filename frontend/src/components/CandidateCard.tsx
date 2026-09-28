import { ArrowRightCircle, Briefcase, MapPin, XCircle } from 'lucide-react'
import type { Candidate } from '../api/types'
import { useNavigate } from '../app/router'
import { skillTone, TAG_COLOR_STYLES } from '../domain/candidates'
import { formatTimeInStage } from '../domain/stages'
import { ActionMenu, type MenuItem } from './ui/ActionMenu'
import { Avatar } from './ui/Avatar'
import { StageBadge } from './StageBadge'

type Props = {
  candidate: Candidate
  now: number
  pending?: 'moving' | 'rejecting'
  matchNote?: string
  rank?: number
  canAct: boolean
  onMove: (c: Candidate) => void
  onReject: (c: Candidate) => void
}

const canMoveForward = (stage: Candidate['currentStage']) => stage !== 'HIRED' && stage !== 'REJECTED'

/** A candidate as shown in the Candidates page's grid: identity, stage, job, skills and tags. */
export function CandidateCard({ candidate, now, pending, matchNote, rank, canAct, onMove, onReject }: Props) {
  const navigate = useNavigate()
  const busy = pending !== undefined
  const open = () => navigate(`/candidates?open=${encodeURIComponent(candidate.id)}`)

  const items: MenuItem[] = [
    { label: 'Open profile', onSelect: open },
    { label: 'Move to next stage', icon: ArrowRightCircle, hidden: !canAct || !canMoveForward(candidate.currentStage), disabled: busy, onSelect: () => onMove(candidate) },
    { label: 'Reject', icon: XCircle, danger: true, hidden: !canAct || !canMoveForward(candidate.currentStage), disabled: busy, onSelect: () => onReject(candidate) },
  ]

  return (
    <article
      aria-label={candidate.name}
      aria-busy={busy || undefined}
      className={`relative flex h-full flex-col rounded-2xl border border-line bg-white p-4 shadow-card transition-opacity ${busy ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start gap-3">
        <button type="button" onClick={open} className="shrink-0 rounded-full">
          <Avatar name={candidate.name} size="md" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <button type="button" onClick={open} className="min-w-0 truncate text-left text-sm font-semibold text-ink-950 hover:text-brand-700">
              {candidate.name}
            </button>
            {rank !== undefined && <span className="shrink-0 rounded-full bg-tint px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">#{rank}</span>}
          </div>
          <p className="truncate text-xs text-ink-500">{candidate.email}</p>
        </div>
        <ActionMenu label={`Actions for ${candidate.name}`} items={items} className="-mt-1 -mr-1" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StageBadge stage={candidate.currentStage} />
        <span className="text-xs text-ink-400">{formatTimeInStage(candidate.currentStageSince, now)} in stage</span>
      </div>

      <div className="mt-2.5 space-y-1 text-xs text-ink-500">
        {candidate.job && (
          <p className="flex items-center gap-1.5 truncate">
            <Briefcase className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {candidate.job.title}
          </p>
        )}
        {candidate.location && (
          <p className="flex items-center gap-1.5 truncate">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {candidate.location}
          </p>
        )}
      </div>

      {candidate.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {candidate.skills.slice(0, 3).map((skill) => (
            <span key={skill} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${skillTone(skill)}`}>
              {skill}
            </span>
          ))}
          {candidate.skills.length > 3 && <span className="rounded-full bg-tint px-2 py-0.5 text-[11px] font-medium text-ink-500">+{candidate.skills.length - 3}</span>}
        </div>
      )}

      {candidate.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {candidate.tags.map((tag) => (
            <span key={tag.id} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TAG_COLOR_STYLES[tag.color] ?? TAG_COLOR_STYLES.slate}`}>
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {matchNote && <p className="mt-2 text-[11px] font-medium text-brand-600">{matchNote}</p>}

      {canAct && canMoveForward(candidate.currentStage) && (
        <div className="mt-3 flex gap-2 border-t border-line pt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onMove(candidate)}
            className="flex-1 rounded-lg bg-brand-50 px-2 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50"
          >
            {pending === 'moving' ? 'Moving…' : 'Move forward'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onReject(candidate)}
            className="flex-1 rounded-lg bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
          >
            {pending === 'rejecting' ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      )}
    </article>
  )
}
