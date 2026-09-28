import { ArrowRight, CheckCircle2, Clock3, Plus, Sparkles, Users, XCircle } from 'lucide-react'
import { useState } from 'react'
import { getActivity } from '../api/feed'
import { getDashboard } from '../api/feed'
import { listJobs } from '../api/jobs'
import type { Job } from '../api/types'
import { useCurrentUser } from '../app/CurrentUser'
import { useDataVersion } from '../app/DataVersion'
import { useNavigate } from '../app/router'
import { ActivityFeedModal, ActivityList } from '../components/ActivityFeed'
import { AddCandidateModal } from '../components/AddCandidateModal'
import { CandidateMiniCard } from '../components/CandidateMiniCard'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Delta } from '../components/ui/Delta'
import { SelectInput } from '../components/ui/Field'
import { Sparkline } from '../components/ui/Sparkline'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/StatusViews'
import { firstName, greeting } from '../domain/format'
import { STAGE_DESCRIPTIONS, STAGE_LABELS, STAGE_STYLES } from '../domain/stages'
import { useAsync } from '../hooks/useAsync'
import { useNow } from '../hooks/useNow'
import { useToast } from '../hooks/useToast'

const PERIODS = [7, 30, 90] as const
type Period = (typeof PERIODS)[number]

function StatCard({ label, value, icon, tile, changePct, series, color, lowerIsBetter }: {
  label: string
  value: number
  icon: React.ReactNode
  tile: string
  changePct: number | null
  series: number[]
  color: string
  lowerIsBetter?: boolean
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tile}`}>{icon}</span>
        <span className="min-w-0 text-sm font-medium text-ink-600">{label}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <p className="text-[28px] leading-none font-bold tracking-tight text-ink-950">{value}</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-400">
            <Delta value={changePct} tone={lowerIsBetter ? 'lowerIsBetter' : 'direction'} /> vs last period
          </p>
        </div>
        <Sparkline values={series} color={color} width={120} height={40} className="hidden sm:block" />
      </div>
    </Card>
  )
}

export default function HomePage() {
  const { me } = useCurrentUser()
  const { version, bump } = useDataVersion()
  const navigate = useNavigate()
  const toast = useToast()

  const [jobId, setJobId] = useState<string | undefined>(undefined)
  const [period, setPeriod] = useState<Period>(30)
  const [adding, setAdding] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const now = useNow(60_000)

  const jobs = useAsync(() => listJobs({ sort: 'title' }), [version])
  const dashboard = useAsync((signal) => getDashboard({ jobId, days: period }, signal), [jobId, period, version])
  const activity = useAsync(() => getActivity({ jobId, limit: 4 }), [jobId, version])

  const d = dashboard.data
  const jobList: Job[] = jobs.data ?? []

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-[26px] font-bold tracking-tight text-ink-950">
            {greeting(new Date(now).getHours())}, {firstName(me.name)} <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-1 text-sm text-ink-500">Here’s what’s happening with your hiring pipeline today.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SelectInput aria-label="Filter by position" value={jobId ?? ''} onChange={(e) => setJobId(e.target.value || undefined)} className="w-44">
            <option value="">All Positions</option>
            {jobList.map((j) => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </SelectInput>
          <SelectInput aria-label="Time period" value={period} onChange={(e) => setPeriod(Number(e.target.value) as Period)} className="w-40">
            {PERIODS.map((p) => (
              <option key={p} value={p}>Last {p} Days</option>
            ))}
          </SelectInput>
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Candidate
          </Button>
        </div>
      </header>

      {dashboard.error && !d && <ErrorState message={dashboard.error} onRetry={dashboard.reload} title="Couldn’t load the dashboard" />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!d && dashboard.loading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[124px]" />)
          : d && (
              <>
                <StatCard label="Total Candidates" value={d.stats.total.value} icon={<Users className="h-5 w-5" />} tile="bg-brand-50 text-brand-600" changePct={d.stats.total.changePct} series={d.stats.total.series} color="#2b60ec" />
                <StatCard label="Hired" value={d.stats.hired.value} icon={<CheckCircle2 className="h-5 w-5" />} tile="bg-emerald-50 text-emerald-600" changePct={d.stats.hired.changePct} series={d.stats.hired.series} color="#10b981" />
                <StatCard label="In Progress" value={d.stats.inProgress.value} icon={<Clock3 className="h-5 w-5" />} tile="bg-blue-50 text-blue-600" changePct={d.stats.inProgress.changePct} series={d.stats.inProgress.series} color="#3b82f6" />
                <StatCard label="Rejected" value={d.stats.rejected.value} icon={<XCircle className="h-5 w-5" />} tile="bg-rose-50 text-rose-600" changePct={d.stats.rejected.changePct} series={d.stats.rejected.series} color="#f43f5e" lowerIsBetter />
              </>
            )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-ink-950">Hiring Pipeline</h2>
        <p className="mt-0.5 text-sm text-ink-500">Track and manage your candidates through the hiring process.</p>

        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          {!d && dashboard.loading
            ? [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-80" />)
            : d?.pipeline.map((col) => (
                <div key={col.stage} className={`flex flex-col rounded-2xl border border-line bg-gradient-to-b to-white p-4 ${STAGE_STYLES[col.stage].column}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink-950">
                      <span className={`h-2 w-2 rounded-full ${STAGE_STYLES[col.stage].dot}`} aria-hidden="true" />
                      {STAGE_LABELS[col.stage]}
                    </span>
                    <span className={`text-sm font-bold ${STAGE_STYLES[col.stage].count}`}>{col.count}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">{STAGE_DESCRIPTIONS[col.stage]}</p>

                  <div className="mt-3 flex-1 space-y-2.5">
                    {col.candidates.length === 0 && <p className="rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-xs text-ink-400">Nobody here yet.</p>}
                    {col.candidates.map((c) => (
                      <CandidateMiniCard key={c.id} candidate={c} now={now} />
                    ))}
                  </div>

                  {col.count > 0 && (
                    <button
                      type="button"
                      onClick={() => navigate(`/candidates?stage=${col.stage}${jobId ? `&jobId=${jobId}` : ''}`)}
                      className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                    >
                      View all {col.count} candidate{col.count === 1 ? '' : 's'} <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-ink-950">Recent Activity</h2>
              <p className="mt-0.5 text-xs text-ink-500">Latest updates from your hiring pipeline.</p>
            </div>
            <button type="button" onClick={() => setShowActivity(true)} className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              View all activity <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-2">
            {activity.loading && !activity.data && <Skeleton className="mt-2 h-40" />}
            {activity.data && activity.data.items.length === 0 && <EmptyState title="Nothing has happened yet" description="Activity will show up here as candidates move through the pipeline." />}
            {activity.data && <ActivityList items={activity.data.items} variant="avatar" now={now} />}
            {activity.error && !activity.data && <p role="alert" className="py-6 text-sm text-rose-600">Couldn’t load recent activity.</p>}
          </div>
        </Card>

        <Card className="relative flex flex-col items-center justify-center overflow-hidden p-6 text-center">
          <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-brand-50" aria-hidden="true" />
          <div className="absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-violet-50" aria-hidden="true" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="relative mt-4 text-base font-semibold text-ink-950">Stronger teams, faster</h2>
          <p className="relative mt-1.5 text-sm text-ink-500">Automate your hiring process and find the best talent, effortlessly.</p>
          <Button variant="primary" className="relative mt-5" onClick={() => navigate('/jobs')}>
            Manage Jobs
          </Button>
        </Card>
      </div>

      {adding && (
        <AddCandidateModal
          jobs={jobList}
          defaultJobId={jobId}
          onClose={() => setAdding(false)}
          onCreated={(created) => {
            toast.success(`Added ${created.name} to Applied.`)
            setAdding(false)
            bump()
          }}
        />
      )}

      {showActivity && <ActivityFeedModal jobId={jobId} onClose={() => setShowActivity(false)} />}
    </div>
  )
}
