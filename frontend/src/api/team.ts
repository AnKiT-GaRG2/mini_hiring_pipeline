import { queryString, request } from './http'
import type { Company, CompanyInput, CompanyProfile, Me, MemberStatus, Role, RoleCapabilities, TeamMember, TeamResponse } from './types'

export function getMe(): Promise<Me> {
  return request<Me>('/api/me')
}

export function updateMe(patch: Partial<Pick<TeamMember, 'name' | 'email' | 'jobTitle' | 'phone' | 'location'>>): Promise<Me> {
  return request<Me>('/api/me', { method: 'PATCH', body: JSON.stringify(patch) })
}

export function listTeam(filter: { q?: string; role?: Role } = {}, signal?: AbortSignal): Promise<TeamResponse> {
  return request<TeamResponse>(`/api/team${queryString(filter)}`, { signal })
}

export function getRoleCapabilities(): Promise<RoleCapabilities> {
  return request<RoleCapabilities>('/api/team/roles')
}

export function addMember(input: { name: string; email: string; role: Role; jobTitle?: string | null }): Promise<TeamMember> {
  return request<TeamMember>('/api/team', { method: 'POST', body: JSON.stringify(input) })
}

export function updateMember(id: string, patch: { role?: Role; status?: MemberStatus; name?: string; jobTitle?: string | null }): Promise<TeamMember> {
  return request<TeamMember>(`/api/team/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export function getCompany(): Promise<CompanyProfile> {
  return request<CompanyProfile>('/api/company')
}

export function saveCompany(input: CompanyInput): Promise<Company> {
  return request<Company>('/api/company', { method: 'PUT', body: JSON.stringify(input) })
}
