import { request } from './http'
import type { Candidate, CreateCandidateInput, SearchResponse, Stage, StageHistoryEntry } from './types'

const base = '/api/candidates'

export function listCandidates(): Promise<Candidate[]> {
  return request<Candidate[]>(base)
}

export function createCandidate(input: CreateCandidateInput): Promise<Candidate> {
  return request<Candidate>(base, { method: 'POST', body: JSON.stringify(input) })
}

export function transitionCandidate(id: string, toStage: Stage): Promise<Candidate> {
  return request<Candidate>(`${base}/${encodeURIComponent(id)}/transition`, {
    method: 'POST',
    body: JSON.stringify({ toStage }),
  })
}

export function rejectCandidate(id: string): Promise<Candidate> {
  return request<Candidate>(`${base}/${encodeURIComponent(id)}/reject`, { method: 'POST' })
}

/** A search that hasn't answered in this long is treated as failed. */
export const SEARCH_TIMEOUT_MS = 15_000

export function searchCandidates(query: string, signal?: AbortSignal): Promise<SearchResponse> {
  return request<SearchResponse>(`/api/search?q=${encodeURIComponent(query)}`, { signal }, { timeoutMs: SEARCH_TIMEOUT_MS })
}

export function getCandidate(id: string): Promise<Candidate> {
  return request<Candidate>(`${base}/${encodeURIComponent(id)}`)
}

export function getCandidateHistory(id: string): Promise<StageHistoryEntry[]> {
  return request<StageHistoryEntry[]>(`${base}/${encodeURIComponent(id)}/history`)
}
