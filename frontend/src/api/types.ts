export const STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'] as const

export type Stage = (typeof STAGES)[number]

export type Candidate = {
  id: string
  name: string
  email: string
  phone: string | null
  currentStage: Stage
  createdAt: string
  updatedAt: string
  /** When the candidate entered their current stage (ISO timestamp). */
  currentStageSince: string
  daysInCurrentStage: number
}

export type CreateCandidateInput = {
  name: string
  email: string
  phone?: string
}

/** Why a candidate matched the name part of a query. */
export type MatchType = 'exact' | 'prefix' | 'word' | 'fuzzy'

export type DurationOperator = '>' | '>=' | '<' | '<=' | '='

/** The filters the backend understood, exactly as it parsed them. */
export type ParsedQuery = {
  name?: { query: string }
  currentStage?: Stage
  excludeStages?: Stage[]
  currentStageDuration?: { operator: DurationOperator; durationDays: number }
  movedToStage?: { stage: Stage; since?: string }
  reachedStageNotHired?: Stage
}

export type SearchResult = Candidate & { score: number | null; matchType: MatchType | null }

export type SearchResponse =
  | { success: true; query: string; parsedQuery: ParsedQuery; results: SearchResult[]; message?: string }
  | { success: false; query: string; message: string; supportedFilters: string[]; results: [] }

export type FieldIssue = { path: string; message: string }

/** One row of a candidate's audit trail. Read-only: the API exposes no way to change it. */
export type StageHistoryEntry = {
  id: string
  fromStage: Stage
  toStage: Stage
  changedAt: string
}
