import { queryString, request } from './http'
import type { Interview, InterviewStats, InterviewStatus, ScheduleInterviewInput, UpdateInterviewInput } from './types'

export function listInterviews(
  range: { from: string; to: string; status?: InterviewStatus; candidateId?: string },
  signal?: AbortSignal,
): Promise<Interview[]> {
  return request<Interview[]>(`/api/interviews${queryString(range)}`, { signal })
}

export function listUpcomingInterviews(limit = 4): Promise<Interview[]> {
  return request<Interview[]>(`/api/interviews/upcoming${queryString({ limit })}`)
}

export function getInterview(id: string): Promise<Interview> {
  return request<Interview>(`/api/interviews/${encodeURIComponent(id)}`)
}

export function getInterviewStats(ranges: { todayFrom: string; todayTo: string; weekFrom: string; weekTo: string }): Promise<InterviewStats> {
  return request<InterviewStats>(`/api/interviews/stats${queryString(ranges)}`)
}

export function scheduleInterview(input: ScheduleInterviewInput): Promise<Interview> {
  return request<Interview>('/api/interviews', { method: 'POST', body: JSON.stringify(input) })
}

export function updateInterview(id: string, patch: UpdateInterviewInput): Promise<Interview> {
  return request<Interview>(`/api/interviews/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })
}
