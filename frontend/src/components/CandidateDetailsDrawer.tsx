import {
  ArrowRightCircle, Briefcase, Calendar, Clock, ExternalLink, GraduationCap, Link2,
  Mail, MapPin, Phone, Plus, Trash2, Video, XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  addNote, addTag, deleteNote, getCandidate, getCandidateHistory, getCandidateInterviews,
  listNotes, listTags, rejectCandidate, removeTag, transitionCandidate,
} from '../api/candidates'
import { errorMessage, isStaleStateError } from '../api/http'
import type { CandidateDetail, Interview, Note, StageHistoryEntry, TagWithCount } from '../api/types'
import { useCurrentUser } from '../app/CurrentUser'
import { useDataVersion } from '../app/DataVersion'
import { useNavigate } from '../app/router'
import { CANDIDATE_SOURCE_LABELS, TAG_COLOR_STYLES } from '../domain/candidates'
import { formatDate, formatMonthYearOf, timeAgo } from '../domain/format'
import { buildTimeline, describeCurrentStage } from '../domain/history'
import { canReject, nextStage, STAGE_LABELS } from '../domain/stages'
import { formatTimeRange } from '../domain/time'
import { useNow } from '../hooks/useNow'
import { useToast } from '../hooks/useToast'
import { ConfirmDialog } from './ConfirmDialog'
import { HistoryTimeline } from './HistoryTimeline'
import { ScheduleInterviewModal } from './ScheduleInterviewModal'
import { StageBadge } from './StageBadge'
import { Avatar } from './ui/Avatar'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { ErrorState, LoadingBlock } from './ui/StatusViews'
import { Tabs } from './ui/Tabs'

type TabId = 'profile' | 'notes' | 'interviews' | 'history'

type Loaded = { candidate: CandidateDetail; history: StageHistoryEntry[]; notes: Note[]; interviews: Interview[] }

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Loaded }

async function loadAll(id: string): Promise<Loaded> {
  const [candidate, history, notes, interviews] = await Promise.all([getCandidate(id), getCandidateHistory(id), listNotes(id), getCandidateInterviews(id)])
  return { candidate, history, notes, interviews }
}

function Row({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 text-sm text-ink-700">
      <Icon className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" /> <span className="min-w-0 truncate">{children}</span>
    </p>
  )
}

function ExternalLinkRow({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 text-sm text-brand-700 hover:underline">
      <Link2 className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="min-w-0 truncate">{label}</span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
    </a>
  )
}

export function CandidateDetailsDrawer({ candidateId, onClose }: { candidateId: string; onClose: () => void }) {
  const { me, can } = useCurrentUser()
  const { bump } = useDataVersion()
  const toast = useToast()
  const now = useNow(30_000)
  const navigate = useNavigate()
  const canAct = can('jobs:manage') || true // every team member may work with candidates; see domain/permissions on the server

  const [state, setState] = useState<State>({ status: 'loading' })
  const [tab, setTab] = useState<TabId>('profile')
  const [rejecting, setRejecting] = useState(false)
  const [moving, setMoving] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [tagText, setTagText] = useState('')
  const [tagOptions, setTagOptions] = useState<TagWithCount[]>([])
  const [addingTag, setAddingTag] = useState(false)
  const [scheduling, setScheduling] = useState(false)

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      setState({ status: 'ready', data: await loadAll(candidateId) })
    } catch (err) {
      setState({ status: 'error', message: errorMessage(err) })
    }
  }, [candidateId])

  useEffect(() => {
    void load()
    listTags().then(setTagOptions, () => {})
  }, [load])

  const data = state.status === 'ready' ? state.data : null

  async function refreshCandidate() {
    if (!data) return
    try {
      const [candidate, history] = await Promise.all([getCandidate(candidateId), getCandidateHistory(candidateId)])
      setState({ status: 'ready', data: { ...data, candidate, history } })
    } catch {
      void load()
    }
  }

  async function move() {
    if (!data) return
    const to = nextStage(data.candidate.currentStage)
    if (!to) return
    setMoving(true)
    try {
      await transitionCandidate(candidateId, to)
      toast.success(`Moved ${data.candidate.name} to ${STAGE_LABELS[to]}.`)
      await refreshCandidate()
      bump()
    } catch (err) {
      if (isStaleStateError(err)) await refreshCandidate()
      toast.error(`Couldn’t move ${data.candidate.name}: ${errorMessage(err)}`)
    } finally {
      setMoving(false)
    }
  }

  async function confirmReject() {
    if (!data) return
    setMoving(true)
    try {
      await rejectCandidate(candidateId)
      toast.success(`Rejected ${data.candidate.name}.`)
      await refreshCandidate()
      bump()
    } catch (err) {
      if (isStaleStateError(err)) await refreshCandidate()
      toast.error(`Couldn’t reject ${data.candidate.name}: ${errorMessage(err)}`)
    } finally {
      setMoving(false)
      setRejecting(false)
    }
  }

  async function submitNote(e: FormEvent) {
    e.preventDefault()
    const body = noteText.trim()
    if (!body || savingNote || !data) return
    setSavingNote(true)
    try {
      const note = await addNote(candidateId, body)
      setState({ status: 'ready', data: { ...data, notes: [note, ...data.notes] } })
      setNoteText('')
    } catch (err) {
      toast.error(`Couldn’t save the note: ${errorMessage(err)}`)
    } finally {
      setSavingNote(false)
    }
  }

  async function removeNote(noteId: string) {
    if (!data) return
    const previous = data.notes
    setState({ status: 'ready', data: { ...data, notes: data.notes.filter((n) => n.id !== noteId) } })
    try {
      await deleteNote(noteId)
    } catch (err) {
      setState({ status: 'ready', data: { ...data, notes: previous } })
      toast.error(`Couldn’t delete the note: ${errorMessage(err)}`)
    }
  }

  async function submitTag(e: FormEvent) {
    e.preventDefault()
    const name = tagText.trim()
    if (!name || addingTag || !data) return
    if (data.candidate.tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setTagText('')
      return
    }
    setAddingTag(true)
    try {
      const tag = await addTag(candidateId, name)
      setState({ status: 'ready', data: { ...data, candidate: { ...data.candidate, tags: [...data.candidate.tags, tag] } } })
      setTagText('')
      listTags().then(setTagOptions, () => {})
    } catch (err) {
      toast.error(`Couldn’t add the tag: ${errorMessage(err)}`)
    } finally {
      setAddingTag(false)
    }
  }

  async function removeCandidateTag(tagId: string) {
    if (!data) return
    const previous = data.candidate.tags
    setState({ status: 'ready', data: { ...data, candidate: { ...data.candidate, tags: previous.filter((t) => t.id !== tagId) } } })
    try {
      await removeTag(candidateId, tagId)
    } catch (err) {
      setState({ status: 'ready', data: { ...data, candidate: { ...data.candidate, tags: previous } } })
      toast.error(`Couldn’t remove the tag: ${errorMessage(err)}`)
    }
  }

  const title = data?.candidate.name ?? 'Candidate details'
  const to = data ? nextStage(data.candidate.currentStage) : null

  return (
    <Modal title={title} variant="drawer" size="md" onClose={onClose}>
      {state.status === 'loading' && <LoadingBlock label="Loading candidate…" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={load} />}

      {data && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar name={data.candidate.name} size="lg" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StageBadge stage={data.candidate.currentStage} />
                  <span className="text-xs text-ink-500">{CANDIDATE_SOURCE_LABELS[data.candidate.source]}</span>
                </div>
                <p className="mt-1 text-xs text-ink-500">{describeCurrentStage(data.candidate.currentStage, data.candidate.currentStageSince, now)}</p>
              </div>
            </div>
            {canAct && canReject(data.candidate.currentStage) && (
              <div className="flex gap-2">
                {to && (
                  <Button variant="primary" size="sm" loading={moving} loadingLabel="Moving…" onClick={() => void move()}>
                    <ArrowRightCircle className="h-4 w-4" aria-hidden="true" /> Move to {STAGE_LABELS[to]}
                  </Button>
                )}
                <Button variant="danger" size="sm" onClick={() => setRejecting(true)}>
                  <XCircle className="h-4 w-4" aria-hidden="true" /> Reject
                </Button>
              </div>
            )}
          </div>

          <Tabs
            aria-label="Candidate sections"
            className="mt-5"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'profile', label: 'Profile' },
              { id: 'notes', label: 'Notes', count: data.notes.length },
              { id: 'interviews', label: 'Interviews', count: data.interviews.length },
              { id: 'history', label: 'History', count: data.history.length },
            ]}
          />

          <div className="mt-5">
            {tab === 'profile' && (
              <div className="space-y-6">
                <div className="space-y-2.5">
                  <Row icon={Mail}><a href={`mailto:${data.candidate.email}`} className="hover:underline">{data.candidate.email}</a></Row>
                  {data.candidate.phone && <Row icon={Phone}>{data.candidate.phone}</Row>}
                  {data.candidate.location && <Row icon={MapPin}>{data.candidate.location}</Row>}
                  {data.candidate.job && <Row icon={Briefcase}>{data.candidate.job.title}</Row>}
                  <Row icon={Clock}>{data.candidate.yearsOfExperience} year{data.candidate.yearsOfExperience === 1 ? '' : 's'} of experience</Row>
                  <Row icon={Calendar}>Applied {formatDate(data.candidate.createdAt)}</Row>
                  {data.candidate.linkedinUrl && <ExternalLinkRow label="LinkedIn" href={data.candidate.linkedinUrl} />}
                  {data.candidate.githubUrl && <ExternalLinkRow label="GitHub" href={data.candidate.githubUrl} />}
                  {data.candidate.portfolioUrl && <ExternalLinkRow label="Portfolio" href={data.candidate.portfolioUrl} />}
                  {data.candidate.resumeUrl && <ExternalLinkRow label="Résumé" href={data.candidate.resumeUrl} />}
                </div>

                {data.candidate.summary && (
                  <div>
                    <h3 className="text-xs font-semibold tracking-wide text-ink-400 uppercase">Summary</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-700">{data.candidate.summary}</p>
                  </div>
                )}

                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-ink-400 uppercase">Skills</h3>
                  {data.candidate.skills.length === 0 ? (
                    <p className="mt-2 text-sm text-ink-400">No skills listed.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {data.candidate.skills.map((s) => (
                        <span key={s} className="rounded-full bg-tint px-2.5 py-1 text-xs font-medium text-ink-700">{s}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-ink-400 uppercase">Tags</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {data.candidate.tags.map((tag) => (
                      <span key={tag.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TAG_COLOR_STYLES[tag.color] ?? TAG_COLOR_STYLES.slate}`}>
                        {tag.name}
                        <button type="button" onClick={() => void removeCandidateTag(tag.id)} aria-label={`Remove tag ${tag.name}`} className="rounded-full p-0.5 hover:bg-black/10">
                          <XCircle className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <form onSubmit={(e) => void submitTag(e)} className="mt-2 flex gap-2">
                    <input
                      value={tagText}
                      onChange={(e) => setTagText(e.target.value)}
                      list="tag-suggestions"
                      placeholder="Add a tag…"
                      maxLength={30}
                      className="h-9 flex-1 rounded-lg border border-line-strong px-3 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                    <datalist id="tag-suggestions">
                      {tagOptions.map((t) => (
                        <option key={t.id} value={t.name} />
                      ))}
                    </datalist>
                    <Button type="submit" size="sm" loading={addingTag} disabled={!tagText.trim()}>
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add
                    </Button>
                  </form>
                </div>

                {data.candidate.experiences.length > 0 && (
                  <div>
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-400 uppercase">
                      <Briefcase className="h-3.5 w-3.5" aria-hidden="true" /> Experience
                    </h3>
                    <ul className="mt-2 space-y-3">
                      {data.candidate.experiences.map((exp) => (
                        <li key={exp.id} className="text-sm">
                          <p className="font-medium text-ink-950">{exp.title} · {exp.company}</p>
                          <p className="text-xs text-ink-500">
                            {formatMonthYearOf(exp.startDate)} – {exp.endDate ? formatMonthYearOf(exp.endDate) : 'Present'}
                          </p>
                          {exp.description && <p className="mt-1 text-ink-600">{exp.description}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.candidate.education.length > 0 && (
                  <div>
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-400 uppercase">
                      <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" /> Education
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {data.candidate.education.map((ed) => (
                        <li key={ed.id} className="text-sm">
                          <p className="font-medium text-ink-950">{ed.degree}{ed.fieldOfStudy ? `, ${ed.fieldOfStudy}` : ''}</p>
                          <p className="text-xs text-ink-500">
                            {ed.institution}
                            {(ed.startYear || ed.endYear) && ` · ${ed.startYear ?? '—'}–${ed.endYear ?? '—'}`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {tab === 'notes' && (
              <div>
                <form onSubmit={(e) => void submitNote(e)} className="flex gap-2">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add a note for the team…"
                    rows={2}
                    maxLength={4000}
                    className="h-auto min-h-[2.5rem] flex-1 resize-y rounded-lg border border-line-strong px-3 py-2 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                  <Button type="submit" variant="primary" loading={savingNote} disabled={!noteText.trim()}>
                    Post
                  </Button>
                </form>

                {data.notes.length === 0 ? (
                  <p className="mt-6 text-center text-sm text-ink-400">No notes yet.</p>
                ) : (
                  <ul className="mt-5 space-y-4">
                    {data.notes.map((note) => (
                      <li key={note.id} className="rounded-xl border border-line bg-white p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Avatar name={note.author.name} size="xs" />
                            <span className="text-xs font-semibold text-ink-800">{note.author.name}</span>
                            <span className="text-xs text-ink-400">{timeAgo(note.createdAt, now)}</span>
                          </div>
                          {(note.author.id === me.id || can('team:manage')) && (
                            <button type="button" onClick={() => void removeNote(note.id)} aria-label="Delete note" className="rounded p-1 text-ink-300 hover:bg-tint hover:text-rose-600">
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        <p className="mt-2 text-sm whitespace-pre-wrap text-ink-700">{note.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === 'interviews' && (
              <div>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    onClick={() => navigate(`/calendar?candidateId=${encodeURIComponent(candidateId)}&name=${encodeURIComponent(data.candidate.name)}`)}
                  >
                    <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> View in Calendar
                  </Button>
                  <Button size="sm" variant="soft" onClick={() => setScheduling(true)}>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Schedule interview
                  </Button>
                </div>
                {data.interviews.length === 0 ? (
                  <p className="mt-6 text-center text-sm text-ink-400">No interviews scheduled yet.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {data.interviews.map((iv) => (
                      <li key={iv.id} className="rounded-xl border border-line bg-white p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-ink-950">{STAGE_LABELS[iv.candidate.currentStage] && iv.type.replace(/_/g, ' ')}</p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                              <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> {formatDate(iv.startsAt)} · {formatTimeRange(iv.startsAt, iv.endsAt, Intl.DateTimeFormat().resolvedOptions().timeZone)}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                              <Video className="h-3.5 w-3.5" aria-hidden="true" /> {iv.interviewers.map((p) => p.name).join(', ')}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${iv.status === 'SCHEDULED' ? 'bg-blue-50 text-blue-700' : iv.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {iv.status[0]}{iv.status.slice(1).toLowerCase()}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === 'history' && (
              data.history.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-sm text-ink-500">No stage changes yet.</p>
              ) : (
                <HistoryTimeline entries={buildTimeline(data.candidate.createdAt, data.history)} now={now} />
              )
            )}
          </div>
        </>
      )}

      {rejecting && data && (
        <ConfirmDialog
          title={`Reject ${data.candidate.name}?`}
          confirmLabel="Reject candidate"
          busyLabel="Rejecting…"
          danger
          busy={moving}
          onConfirm={() => void confirmReject()}
          onCancel={() => setRejecting(false)}
        >
          This can’t be undone — {data.candidate.name} will move to Rejected and can no longer be advanced.
        </ConfirmDialog>
      )}

      {scheduling && data && (
        <ScheduleInterviewModal
          candidates={[{ id: data.candidate.id, name: data.candidate.name }]}
          defaultCandidateId={data.candidate.id}
          tz={Intl.DateTimeFormat().resolvedOptions().timeZone}
          onClose={() => setScheduling(false)}
          onSaved={(iv) => {
            setState({ status: 'ready', data: { ...data, interviews: [iv, ...data.interviews] } })
            setScheduling(false)
            toast.success('Interview scheduled.')
            bump()
          }}
        />
      )}

      <div className="mt-8 flex justify-end border-t border-line pt-4">
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}
