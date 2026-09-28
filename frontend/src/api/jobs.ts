import { queryString, request } from './http'
import type { Job, JobInput, JobsOverview, JobSort, JobStatus } from './types'

export function listJobs(filter: { status?: JobStatus; q?: string; sort?: JobSort } = {}, signal?: AbortSignal): Promise<Job[]> {
  return request<Job[]>(`/api/jobs${queryString(filter)}`, { signal })
}

export function getJobsOverview(): Promise<JobsOverview> {
  return request<JobsOverview>('/api/jobs/overview')
}

export function createJob(input: JobInput): Promise<Job> {
  return request<Job>('/api/jobs', { method: 'POST', body: JSON.stringify(input) })
}

export function updateJob(id: string, patch: Partial<JobInput>): Promise<Job> {
  return request<Job>(`/api/jobs/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })
}
