import { queryString, request } from './http'
import type { ActivityPage, Dashboard, GlobalSearchResponse, NotificationsResponse } from './types'

export function getDashboard(params: { jobId?: string; days: 7 | 30 | 90 }, signal?: AbortSignal): Promise<Dashboard> {
  return request<Dashboard>(`/api/dashboard${queryString(params)}`, { signal })
}

export function getActivity(params: { jobId?: string; candidateId?: string; limit?: number; before?: string } = {}): Promise<ActivityPage> {
  return request<ActivityPage>(`/api/activity${queryString(params)}`)
}

export function getNotifications(): Promise<NotificationsResponse> {
  return request<NotificationsResponse>('/api/notifications')
}

export function markNotificationsRead(ids?: string[]): Promise<{ updated: number }> {
  return request<{ updated: number }>('/api/notifications/read', { method: 'POST', body: JSON.stringify(ids ? { ids } : {}) })
}

/** The top-bar quick search: a few candidates, jobs and skills containing the text. */
export function globalSearch(q: string, signal?: AbortSignal): Promise<GlobalSearchResponse> {
  return request<GlobalSearchResponse>(`/api/search/global${queryString({ q })}`, { signal })
}
