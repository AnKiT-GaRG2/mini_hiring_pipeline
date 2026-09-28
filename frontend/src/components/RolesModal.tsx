import { Check } from 'lucide-react'
import { getRoleCapabilities } from '../api/team'
import type { RoleCapabilities } from '../api/types'
import { useAsync } from '../hooks/useAsync'
import { Modal } from './ui/Modal'
import { ErrorState, LoadingBlock } from './ui/StatusViews'

/** What each role may do — a read-only reference, since permissions are fixed per role. */
export function RolesModal({ onClose }: { onClose: () => void }) {
  const roles = useAsync<RoleCapabilities>(() => getRoleCapabilities(), [])

  return (
    <Modal title="Roles & permissions" description="What each role can do across the app." onClose={onClose} size="lg">
      <div className="mt-4">
        {roles.loading && !roles.data && <LoadingBlock />}
        {roles.error && !roles.data && <ErrorState message={roles.error} onRetry={roles.reload} />}
        {roles.data && (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white px-3 py-2 text-left text-xs font-semibold text-ink-500">Capability</th>
                  {roles.data.roles.map((r) => (
                    <th key={r.role} className="px-3 py-2 text-center text-xs font-semibold text-ink-500">{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roles.data.capabilities.map((cap) => (
                  <tr key={cap.label} className="border-t border-line">
                    <td className="px-3 py-3">
                      <p className="font-medium text-ink-950">{cap.label}</p>
                      <p className="text-xs text-ink-500">{cap.description}</p>
                    </td>
                    {roles.data!.roles.map((r) => (
                      <td key={r.role} className="px-3 py-3 text-center">
                        {cap.roles.includes(r.role) && <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label={`${r.label} can`} />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}
