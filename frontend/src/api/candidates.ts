import { downloadFile, queryString, request } from './http'
import type {
  Candidate,
  CandidateDetail,
  CandidateInput,
  CandidatePage,
  CandidateQuery,
  Interview,
  Note,
  SearchResponse,
  Stage,
  StageCounts,
  StageHistoryEntry,
  Tag,
  TagWithCount,
} from './types'

const base = '/api/candidates'
const path = (id: string, rest = '') => `${base}/${encodeURIComponent(id)}${rest}`

export function listCandidates(query: CandidateQuery = {}, signal?: AbortSignal): Promise<CandidatePage> {
  return request<CandidatePage>(`${base}${queryString({ ...query })}`, { signal })
}

export function getStageCounts(jobId?: string): Promise<StageCounts> {
  return request<StageCounts>(`${base}/counts${queryString({ jobId })}`)
}

export function createCandidate(input: CandidateInput): Promise<CandidateDetail> {
  return request<CandidateDetail>(base, { method: 'POST', body: JSON.stringify(input) })
}

export function updateCandidate(id: string, patch: Partial<CandidateInput>): Promise<CandidateDetail> {
  return request<CandidateDetail>(path(id), { method: 'PATCH', body: JSON.stringify(patch) })
}

export function getCandidate(id: string): Promise<CandidateDetail> {
  return request<CandidateDetail>(path(id))
}

export function getCandidateHistory(id: string): Promise<StageHistoryEntry[]> {
  return request<StageHistoryEntry[]>(path(id, '/history'))
}

export function transitionCandidate(id: string, toStage: Stage): Promise<Candidate> {
  return request<Candidate>(path(id, '/transition'), { method: 'POST', body: JSON.stringify({ toStage }) })
}

export function rejectCandidate(id: string): Promise<Candidate> {
  return request<Candidate>(path(id, '/reject'), { method: 'POST' })
}

export function getCandidateInterviews(id: string): Promise<Interview[]> {
  return request<Interview[]>(path(id, '/interviews'))
}

export function listNotes(id: string): Promise<Note[]> {
  return request<Note[]>(path(id, '/notes'))
}

export function addNote(id: string, body: string): Promise<Note> {
  return request<Note>(path(id, '/notes'), { method: 'POST', body: JSON.stringify({ body }) })
}

export function deleteNote(noteId: string): Promise<void> {
  return request<void>(`/api/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' })
}

export function listTags(): Promise<TagWithCount[]> {
  return request<TagWithCount[]>('/api/tags')
}

export function addTag(id: string, name: string): Promise<Tag> {
  return request<Tag>(path(id, '/tags'), { method: 'POST', body: JSON.stringify({ name }) })
}

export function removeTag(id: string, tagId: string): Promise<void> {
  return request<void>(path(id, `/tags/${encodeURIComponent(tagId)}`), { method: 'DELETE' })
}

export function exportCandidates(query: CandidateQuery = {}): Promise<void> {
  const { page: _page, pageSize: _pageSize, ...filters } = query
  return downloadFile(`${base}/export.csv${queryString(filters)}`, 'candidates.csv')
}

/** A search that hasn't answered in this long is treated as failed. */
export const SEARCH_TIMEOUT_MS = 15_000

/** The natural-language search: "who has been stuck in Screening for more than a week?" */
export function searchCandidates(query: string, signal?: AbortSignal): Promise<SearchResponse> {
  return request<SearchResponse>(`/api/search${queryString({ q: query })}`, { signal }, { timeoutMs: SEARCH_TIMEOUT_MS })
}
