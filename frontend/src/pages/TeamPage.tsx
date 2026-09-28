import { Mail, Plus, Search, Shield, ShieldCheck, UserRound, UserRoundCog, Users } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { updateMember } from '../api/team'
import { errorMessage } from '../api/http'
import type { Role, TeamMember } from '../api/types'
import { useCurrentUser } from '../app/CurrentUser'
import { useDataVersion } from '../app/DataVersion'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { RolesModal } from '../components/RolesModal'
import { TeamFormModal } from '../components/TeamFormModal'
import { ActionMenu, type MenuItem } from '../components/ui/ActionMenu'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Donut } from '../components/ui/Donut'
import { SelectInput } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/StatusViews'
import { StatCard } from '../components/StatCard'
import { formatMonthYearOf } from '../domain/format'
import { ROLE_LABELS, ROLE_STYLES, ROLES } from '../domain/roles'
import { useAsync } from '../hooks/useAsync'
import { useToast } from '../hooks/useToast'
import { listTeam } from '../api/team'

export default function TeamPage() {
  const { me, can } = useCurrentUser()
  const canManage = can('team:manage')
  const canAssignAdmin = can('admin:assign')
  const toast = useToast()
  const { version, bump } = useDataVersion()

  const [q, setQ] = useState('')
  const debouncedQ = useDeferredValue(q)
  const [role, setRole] = useState<Role | ''>('')
  const [editing, setEditing] = useState<TeamMember | 'new' | null>(null)
  const [showRoles, setShowRoles] = useState(false)
  const [statusTarget, setStatusTarget] = useState<{ member: TeamMember; next: 'ACTIVE' | 'DEACTIVATED' } | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)

  const team = useAsync((signal) => listTeam({ q: debouncedQ || undefined, role: role || undefined }, signal), [debouncedQ, role, version])

  async function confirmStatus() {
    if (!statusTarget) return
    setStatusBusy(true)
    try {
      await updateMember(statusTarget.member.id, { status: statusTarget.next })
      toast.success(`${statusTarget.next === 'ACTIVE' ? 'Reactivated' : 'Deactivated'} ${statusTarget.member.name}.`)
      bump()
    } catch (err) {
      toast.error(`Couldn’t update ${statusTarget.member.name}: ${errorMessage(err)}`)
    } finally {
      setStatusBusy(false)
      setStatusTarget(null)
    }
  }

  const summary = team.data?.summary
  const segments = ROLES.map((r) => ({ label: ROLE_LABELS[r], value: summary?.byRole[r] ?? 0, color: ROLE_STYLES[r].chart }))

  function menuFor(member: TeamMember): MenuItem[] {
    const self = member.id === me.id
    const touchesAdmin = member.role === 'ADMIN'
    const allowed = canManage && !self && (!touchesAdmin || canAssignAdmin)
    return [
      { label: 'Edit role & title', icon: UserRoundCog, hidden: !allowed, onSelect: () => setEditing(member) },
      {
        label: member.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate',
        icon: Shield,
        danger: member.status === 'ACTIVE',
        hidden: !allowed,
        onSelect: () => setStatusTarget({ member, next: member.status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE' }),
      },
    ]
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Team"
        title="Manage Teams"
        subtitle="Add and manage your team members, roles and permissions."
        actions={
          canManage && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add Member
            </Button>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Members" value={summary?.total ?? (team.loading ? <Skeleton className="h-7 w-8" /> : 0)} icon={<Users className="h-5 w-5" />} tile="bg-brand-50 text-brand-600" />
            <StatCard label="Recruiters" value={summary?.byRole.RECRUITER ?? 0} icon={<UserRound className="h-5 w-5" />} tile="bg-emerald-50 text-emerald-600" />
            <StatCard label="Hiring Manager" value={summary?.byRole.HIRING_MANAGER ?? 0} icon={<UserRoundCog className="h-5 w-5" />} tile="bg-violet-50 text-violet-600" />
            <StatCard label="Admin" value={summary?.byRole.ADMIN ?? 0} icon={<ShieldCheck className="h-5 w-5" />} tile="bg-amber-50 text-amber-600" />
          </div>

          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search team members..."
                  className="h-10 w-full rounded-[10px] border border-line-strong bg-white pl-9 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
              <SelectInput aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value as Role | '')} className="w-40">
                <option value="">All Roles</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </SelectInput>
            </div>

            <div className="mt-4">
              {team.loading && !team.data && <Skeleton className="h-64" />}
              {team.error && !team.data && <ErrorState message={team.error} onRetry={team.reload} title="Couldn’t load the team" />}
              {team.data && team.data.members.length === 0 && (
                <EmptyState icon={<Users className="h-5 w-5" />} title="No one matches" description="Try a different name, email or role." />
              )}
              {team.data && team.data.members.length > 0 && (
                <div className="scrollbar-thin -mx-1 overflow-x-auto">
                  <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="text-left text-xs font-medium text-ink-500">
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2">Role</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Joined</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {team.data.members.map((m) => (
                        <tr key={m.id} className={`border-t border-line ${m.status === 'DEACTIVATED' ? 'opacity-60' : ''}`}>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={m.name} size="sm" />
                              <span className="font-medium text-ink-950">
                                {m.name}
                                {m.id === me.id && <span className="ml-1.5 text-xs font-normal text-ink-400">(you)</span>}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-ink-600">
                            <span className="flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" /> {m.email}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_STYLES[m.role].badge}`}>{ROLE_LABELS[m.role]}</span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${m.status === 'ACTIVE' ? 'text-emerald-600' : 'text-ink-400'}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${m.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-ink-300'}`} aria-hidden="true" />
                              {m.status === 'ACTIVE' ? 'Active' : 'Deactivated'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-ink-600">{formatMonthYearOf(m.joinedAt)}</td>
                          <td className="px-2 py-3 text-right">
                            <ActionMenu label={`Actions for ${m.name}`} items={menuFor(m)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </div>

        <aside className="space-y-6" aria-label="Team insights">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Users className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 className="text-[15px] font-semibold text-ink-950">Team Overview</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-600">
              {summary && summary.total > 0
                ? `Your team is growing! You have ${summary.total} member${summary.total === 1 ? '' : 's'} across different roles. Keep building your dream team.`
                : 'Add your first team member to get started.'}
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="text-[15px] font-semibold text-ink-950">Roles Distribution</h2>
            <div className="mt-4 flex items-center gap-6">
              <Donut segments={segments} size={124} thickness={16} aria-label="Team members by role">
                <span className="text-2xl leading-none font-bold text-ink-950">{summary?.total ?? 0}</span>
                <span className="mt-1 text-[11px] text-ink-500">Members</span>
              </Donut>
              <ul className="flex-1 space-y-2.5 text-sm">
                {segments.map((s) => (
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
            <h2 className="text-[15px] font-semibold text-ink-950">Quick Actions</h2>
            <div className="mt-3 space-y-1">
              {canManage && (
                <button type="button" onClick={() => setEditing('new')} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-tint">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Plus className="h-4 w-4" aria-hidden="true" /></span>
                  <span>
                    <span className="block text-sm font-medium text-ink-950">Invite Member</span>
                    <span className="block text-xs text-ink-500">Send an invite to your team member</span>
                  </span>
                </button>
              )}
              <button type="button" onClick={() => setShowRoles(true)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-tint">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-50 text-violet-600"><ShieldCheck className="h-4 w-4" aria-hidden="true" /></span>
                <span>
                  <span className="block text-sm font-medium text-ink-950">Manage Roles</span>
                  <span className="block text-xs text-ink-500">Update roles and permissions</span>
                </span>
              </button>
            </div>
          </Card>
        </aside>
      </div>

      {editing && (
        <TeamFormModal
          member={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            toast.success(editing === 'new' ? `Added ${saved.name} to the team.` : `Saved ${saved.name}.`)
            setEditing(null)
            bump()
          }}
        />
      )}

      {statusTarget && (
        <ConfirmDialog
          title={`${statusTarget.next === 'ACTIVE' ? 'Reactivate' : 'Deactivate'} ${statusTarget.member.name}?`}
          confirmLabel={statusTarget.next === 'ACTIVE' ? 'Reactivate' : 'Deactivate'}
          busyLabel="Working…"
          danger={statusTarget.next === 'DEACTIVATED'}
          busy={statusBusy}
          onConfirm={() => void confirmStatus()}
          onCancel={() => setStatusTarget(null)}
        >
          {statusTarget.next === 'DEACTIVATED'
            ? 'They’ll lose access immediately. You can reactivate them at any time, and everything they did stays on record.'
            : 'They’ll be able to sign in and work with candidates again.'}
        </ConfirmDialog>
      )}

      {showRoles && <RolesModal onClose={() => setShowRoles(false)} />}
    </div>
  )
}
