import { ArrowRight, Briefcase, Clock, Lock, Pause, Pencil, Play, Plus, RotateCcw, Trophy, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { getActivity } from '../api/feed'
import { errorMessage } from '../api/http'
import { getJobsOverview, listJobs, updateJob } from '../api/jobs'
import type { Job, JobSort, JobStatus } from '../api/types'
import { useDataVersion } from '../app/DataVersion'
import { useCurrentUser } from '../app/CurrentUser'
import { useNavigate, useSearchParams } from '../app/router'
import { ActivityFeedModal, ActivityList } from '../components/ActivityFeed'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { JobFormModal } from '../components/JobFormModal'
import { StatCard } from '../components/StatCard'
import { ActionMenu, type MenuItem } from '../components/ui/ActionMenu'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { Delta } from '../components/ui/Delta'
import { Donut } from '../components/ui/Donut'
import { SelectInput } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/StatusViews'
import { Tabs } from '../components/ui/Tabs'
import { formatDate } from '../domain/format'
import { EMPLOYMENT_LABELS, JOB_STATUS_LABELS, JOB_STATUS_STYLES, WORK_MODE_LABELS, jobIconFor } from '../domain/jobs'
import { useAsync } from '../hooks/useAsync'
import { useToast } from '../hooks/useToast'

const PAGE_SIZE = 5

type TabId = 'all' | JobStatus

const SORT_LABELS: Record<JobSort, string> = {
  recent: 'Recent',
  oldest: 'Oldest',
  applicants: 'Most applicants',
  title: 'Title (A–Z)',
}

const ROW_GRID = 'md:grid md:grid-cols-[minmax(0,1fr)_88px_72px_112px_112px_36px] md:items-center md:gap-4'

function StatusPill({ status }: { status: JobStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${JOB_STATUS_STYLES[status].badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${JOB_STATUS_STYLES[status].dot}`} aria-hidden="true" />
      {JOB_STATUS_LABELS[status]}
    </span>
  )
}

function Chip({ children }: { children: string }) {
  return <span className="rounded-full bg-tint px-2.5 py-0.5 text-[11px] font-medium text-ink-600">{children}</span>
}

function JobRow({ job, canManage, onEdit, onSetStatus, onViewCandidates }: {
  job: Job
  canManage: boolean
  onEdit: (job: Job) => void
  onSetStatus: (job: Job, status: JobStatus) => void
  onViewCandidates: (job: Job) => void
}) {
  const { Icon, tile } = jobIconFor(job.title)
  const items: MenuItem[] = [
    { label: 'View candidates', icon: Users, onSelect: () => onViewCandidates(job) },
    { label: 'Edit job', icon: Pencil, hidden: !canManage, onSelect: () => onEdit(job) },
    { label: 'Pause hiring', icon: Pause, hidden: !canManage || job.status !== 'OPEN', onSelect: () => onSetStatus(job, 'PAUSED') },
    { label: 'Resume hiring', icon: Play, hidden: !canManage || job.status !== 'PAUSED', onSelect: () => onSetStatus(job, 'OPEN') },
    { label: 'Reopen job', icon: RotateCcw, hidden: !canManage || job.status !== 'CLOSED', onSelect: () => onSetStatus(job, 'OPEN') },
    { label: 'Close job', icon: Lock, danger: true, hidden: !canManage || job.status === 'CLOSED', onSelect: () => onSetStatus(job, 'CLOSED') },
  ]

  return (
    <li className={`rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgb(16_24_64/0.03)] ${ROW_GRID}`}>
      <div className="flex min-w-0 items-center gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tile}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-950">{job.title}</p>
          {job.description && <p className="mt-0.5 truncate text-xs text-ink-500">{job.description}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip>{WORK_MODE_LABELS[job.workMode]}</Chip>
            <Chip>{EMPLOYMENT_LABELS[job.employmentType]}</Chip>
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-4 items-center gap-2 text-sm md:mt-0 md:contents">
        <div className="md:text-center">
          <dt className="text-[11px] text-ink-400 md:sr-only">Applicants</dt>
          <dd className="font-semibold text-ink-950">{job.total}</dd>
        </div>
        <div className="md:text-center">
          <dt className="text-[11px] text-ink-400 md:sr-only">Hired</dt>
          <dd className="font-semibold text-ink-950">{job.hired}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-ink-400 md:sr-only">Status</dt>
          <dd><StatusPill status={job.status} /></dd>
        </div>
        <div>
          <dt className="text-[11px] text-ink-400 md:sr-only">Posted</dt>
          <dd className="text-xs text-ink-600">{formatDate(job.createdAt)}</dd>
        </div>
      </dl>

      <div className="mt-2 flex justify-end md:mt-0">
        <ActionMenu label={`Actions for ${job.title}`} items={items} />
      </div>
    </li>
  )
}

function CreateJobIllustration() {
  return (
    <svg viewBox="0 0 96 96" className="h-24 w-24 shrink-0" aria-hidden="true">
      <rect x="14" y="10" width="56" height="72" rx="8" fill="#eef3ff" />
      <rect x="22" y="20" width="26" height="5" rx="2.5" fill="#c5d5ff" />
      <rect x="22" y="32" width="40" height="4" rx="2" fill="#dbe5ff" />
      <rect x="22" y="42" width="40" height="4" rx="2" fill="#dbe5ff" />
      <rect x="22" y="52" width="28" height="4" rx="2" fill="#dbe5ff" />
      <circle cx="68" cy="66" r="15" fill="#2b60ec" />
      <path d="M68 59v14M61 66h14" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export default function JobsPage() {
  const { can } = useCurrentUser()
  const canManage = can('jobs:manage')
  const toast = useToast()
  const { version, bump } = useDataVersion()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const tab = (['OPEN', 'PAUSED', 'CLOSED'].includes(params.get('status') ?? '') ? params.get('status') : 'all') as TabId
  const q = params.get('q') ?? ''
  const [sort, setSort] = useState<JobSort>('recent')
  const [page, setPage] = useState(1)

  const [editing, setEditing] = useState<Job | 'new' | null>(null)
  const [closing, setClosing] = useState<Job | null>(null)
  const [closeBusy, setCloseBusy] = useState(false)
  const [showActivity, setShowActivity] = useState(false)

  const overview = useAsync(() => getJobsOverview(), [version])
  const jobs = useAsync((signal) => listJobs({ status: tab === 'all' ? undefined : tab, q: q || undefined, sort }, signal), [tab, q, sort, version])
  const activity = useAsync(() => getActivity({ limit: 4 }), [version])

  const list = jobs.data ?? []
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = useMemo(() => list.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [list, currentPage])

  const counts = overview.data?.statusCounts
  const tabs = [
    { id: 'all' as const, label: 'All Jobs', count: counts?.total },
    { id: 'OPEN' as const, label: 'Active', count: counts?.OPEN },
    { id: 'PAUSED' as const, label: 'On Hold', count: counts?.PAUSED },
    { id: 'CLOSED' as const, label: 'Closed', count: counts?.CLOSED },
  ]

  async function setStatus(job: Job, status: JobStatus) {
    if (status === 'CLOSED') {
      setClosing(job)
      return
    }
    try {
      await updateJob(job.id, { status })
      toast.success(status === 'OPEN' ? `${job.title} is accepting candidates again.` : `Paused hiring for ${job.title}.`)
      bump()
    } catch (err) {
      toast.error(`Couldn’t update ${job.title}: ${errorMessage(err)}`)
    }
  }

  async function confirmClose() {
    if (!closing) return
    setCloseBusy(true)
    try {
      await updateJob(closing.id, { status: 'CLOSED' })
      toast.success(`Closed ${closing.title}.`)
      bump()
    } catch (err) {
      toast.error(`Couldn’t close ${closing.title}: ${errorMessage(err)}`)
    } finally {
      setCloseBusy(false)
      setClosing(null)
    }
  }

  const o = overview.data
  const statusSegments = [
    { label: 'Active', value: counts?.OPEN ?? 0, color: JOB_STATUS_STYLES.OPEN.bar },
    { label: 'On Hold', value: counts?.PAUSED ?? 0, color: JOB_STATUS_STYLES.PAUSED.bar },
    { label: 'Closed', value: counts?.CLOSED ?? 0, color: JOB_STATUS_STYLES.CLOSED.bar },
  ]
  const maxApplicants = Math.max(1, ...(o?.topPositions.map((p) => p.applicants) ?? [1]))

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Jobs"
        title="Open Positions"
        subtitle="Manage your job postings and track hiring progress."
        actions={
          canManage && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Create Job
            </Button>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {overview.loading && !o ? (
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[112px]" />)
            ) : o ? (
              <>
                <StatCard
                  label="Total Openings"
                  value={o.openings.value}
                  icon={<Briefcase className="h-5 w-5" />}
                  tile="bg-brand-50 text-brand-600"
                  caption={<><Delta value={o.openings.addedRecently > 0 ? o.openings.addedRecently : null} /><span>{o.openings.addedRecently > 0 ? 'new in last 30 days' : 'none new lately'}</span></>}
                />
                <StatCard
                  label="Total Applicants"
                  value={o.applicants.value}
                  icon={<Users className="h-5 w-5" />}
                  tile="bg-emerald-50 text-emerald-600"
                  caption={<><Delta value={o.applicants.changePct} /><span>vs previous 30 days</span></>}
                />
                <StatCard
                  label="Hired"
                  value={o.hired.value}
                  icon={<Trophy className="h-5 w-5" />}
                  tile="bg-violet-50 text-violet-600"
                  caption={<><Delta value={o.hired.changePct} /><span>vs previous 30 days</span></>}
                />
                <StatCard
                  label="Avg. Time to Fill"
                  value={o.avgTimeToFill.days === null ? '—' : `${o.avgTimeToFill.days} days`}
                  icon={<Clock className="h-5 w-5" />}
                  tile="bg-amber-50 text-amber-600"
                  caption={<><Delta value={o.avgTimeToFill.changePct} tone="lowerIsBetter" /><span title="Average days from application to hire">vs previous 30 days</span></>}
                />
              </>
            ) : null}
          </div>
          {overview.error && !o && <ErrorState message={overview.error} onRetry={overview.reload} title="Couldn’t load the figures" />}

          <Card>
            <Tabs
              aria-label="Filter jobs by status"
              tabs={tabs}
              value={tab}
              onChange={(id) => {
                setPage(1)
                setParams({ status: id === 'all' ? undefined : id })
              }}
              className="px-2"
              right={
                <div className="flex items-center gap-2 py-2 pr-3">
                  <label htmlFor="job-sort" className="sr-only">Sort jobs</label>
                  <SelectInput
                    id="job-sort"
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value as JobSort)
                      setPage(1)
                    }}
                    className="w-44"
                    aria-label="Sort jobs"
                  >
                    {(Object.keys(SORT_LABELS) as JobSort[]).map((s) => (
                      <option key={s} value={s}>Sort by: {SORT_LABELS[s]}</option>
                    ))}
                  </SelectInput>
                </div>
              }
            />

            <div className="space-y-3 p-4">
              {q && (
                <p className="flex items-center gap-2 text-sm text-ink-600">
                  Showing jobs matching <strong className="font-semibold text-ink-950">“{q}”</strong>
                  <button type="button" onClick={() => setParams({ q: undefined })} className="inline-flex items-center gap-1 rounded-full bg-tint px-2 py-0.5 text-xs font-medium hover:bg-line">
                    Clear <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </p>
              )}

              <div className={`hidden px-4 text-xs font-medium text-ink-500 ${ROW_GRID}`} aria-hidden="true">
                <span>Job Title</span>
                <span className="text-center">Applicants</span>
                <span className="text-center">Hired</span>
                <span>Status</span>
                <span>Posted</span>
                <span />
              </div>

              {jobs.loading && !jobs.data && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[92px]" />)}
              {jobs.error && !jobs.data && <ErrorState message={jobs.error} onRetry={jobs.reload} title="Couldn’t load jobs" />}

              {jobs.data && list.length === 0 && (
                <EmptyState
                  icon={<Briefcase className="h-5 w-5" />}
                  title={q || tab !== 'all' ? 'No jobs match' : 'No jobs yet'}
                  description={q || tab !== 'all' ? 'Try a different status or clear the search.' : 'Create your first job to start receiving candidates.'}
                  action={canManage && !q && tab === 'all' ? <Button variant="primary" onClick={() => setEditing('new')}>Create Job</Button> : undefined}
                />
              )}

              <ul className={`space-y-3 ${jobs.loading && jobs.data ? 'opacity-60 transition-opacity' : ''}`} aria-label="Jobs">
                {visible.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    canManage={canManage}
                    onEdit={setEditing}
                    onSetStatus={(j, s) => void setStatus(j, s)}
                    onViewCandidates={(j) => navigate(`/candidates?jobId=${encodeURIComponent(j.id)}`)}
                  />
                ))}
              </ul>

              {list.length > 0 && (
                <div className="pt-2">
                  <Pagination page={currentPage} pageSize={PAGE_SIZE} total={list.length} onPage={setPage} noun={list.length === 1 ? 'job' : 'jobs'} />
                </div>
              )}
            </div>
          </Card>
        </div>

        <aside className="space-y-6" aria-label="Job insights">
          {canManage && (
            <Card className="flex items-center gap-4 p-5">
              <CreateJobIllustration />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-ink-950">Create a new job</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-500">Reach top talent with a well-crafted job post and clear requirements.</p>
                <Button variant="primary" className="mt-3 w-full" onClick={() => setEditing('new')}>
                  Create Job
                </Button>
              </div>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="text-[15px] font-semibold text-ink-950">Job Status</h2>
            <div className="mt-4 flex items-center gap-6">
              <Donut segments={statusSegments} size={124} thickness={16} aria-label="Jobs by status">
                <span className="text-2xl leading-none font-bold text-ink-950">{counts?.total ?? 0}</span>
                <span className="mt-1 text-[11px] text-ink-500">Total Jobs</span>
              </Donut>
              <ul className="flex-1 space-y-2.5 text-sm">
                {statusSegments.map((s) => (
                  <li key={s.label} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-ink-600">
                      <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                      {s.label}
                    </span>
                    <span className="font-semibold text-ink-950">{s.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-[15px] font-semibold text-ink-950">Top Positions by Applicants</h2>
            {o && o.topPositions.length === 0 && <p className="mt-4 text-sm text-ink-500">No applicants yet.</p>}
            <ul className="mt-4 space-y-3.5">
              {o?.topPositions.map((p) => (
                <li key={p.id}>
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="truncate text-ink-600">{p.title}</span>
                    <span className="font-semibold text-ink-950">{p.applicants}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-tint" role="presentation">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(p.applicants / maxApplicants) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <CardHeader
              title="Recent Activity"
              action={
                <button type="button" onClick={() => setShowActivity(true)} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                  View all <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </button>
              }
            />
            <div className="mt-2">
              {activity.data && activity.data.items.length === 0 && <p className="py-4 text-sm text-ink-500">Nothing has happened yet.</p>}
              {activity.data && <ActivityList items={activity.data.items} variant="icon" />}
              {activity.error && !activity.data && <p role="alert" className="py-4 text-sm text-rose-600">Couldn’t load activity.</p>}
            </div>
          </Card>
        </aside>
      </div>

      {editing && (
        <JobFormModal
          job={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            toast.success(editing === 'new' ? `Created ${saved.title}.` : `Saved ${saved.title}.`)
            setEditing(null)
            bump()
          }}
        />
      )}

      {closing && (
        <ConfirmDialog title={`Close ${closing.title}?`} confirmLabel="Close job" busyLabel="Closing…" danger busy={closeBusy} onConfirm={() => void confirmClose()} onCancel={() => setClosing(null)}>
          <p>
            No new candidates can be added to a closed job. Existing candidates stay where they are, and you can reopen it at any time.
          </p>
        </ConfirmDialog>
      )}

      {showActivity && <ActivityFeedModal onClose={() => setShowActivity(false)} />}
    </div>
  )
}
