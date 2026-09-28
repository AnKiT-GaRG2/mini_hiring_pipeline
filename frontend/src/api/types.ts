export const STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'] as const
export type Stage = (typeof STAGES)[number]

export type FieldIssue = { path: string; message: string }

// ───────────────────────────── people ─────────────────────────────

export type Role = 'ADMIN' | 'HIRING_MANAGER' | 'RECRUITER'
export type MemberStatus = 'ACTIVE' | 'DEACTIVATED'
export type Permission = 'team:manage' | 'company:edit' | 'jobs:manage' | 'admin:assign'

export type TeamMember = {
  id: string
  name: string
  email: string
  role: Role
  status: MemberStatus
  jobTitle: string | null
  phone: string | null
  location: string | null
  joinedAt: string
}

export type Me = TeamMember & { permissions: Permission[] }

export type TeamResponse = {
  members: TeamMember[]
  summary: { total: number; byRole: Record<Role, number> }
}

export type RoleCapabilities = {
  roles: { role: Role; label: string }[]
  capabilities: { label: string; description: string; roles: Role[] }[]
}

export type PersonRef = { id: string; name: string }

// ───────────────────────────── company ─────────────────────────────

export type Company = {
  name: string
  website: string | null
  industry: string | null
  size: string | null
  location: string | null
  description: string | null
  logoDataUrl: string | null
  coverDataUrl: string | null
  updatedAt: string
}

export type CompanyProfile = Company & { options: { industries: string[]; sizes: string[] } }

export type CompanyInput = {
  name: string
  website?: string | null
  industry?: string | null
  size?: string | null
  location?: string | null
  description?: string | null
  logoDataUrl?: string | null
  coverDataUrl?: string | null
}

// ───────────────────────────── jobs ─────────────────────────────

export type JobStatus = 'OPEN' | 'PAUSED' | 'CLOSED'
export type WorkMode = 'REMOTE' | 'HYBRID' | 'ON_SITE'
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP'

export type Job = {
  id: string
  title: string
  department: string | null
  location: string | null
  workMode: WorkMode
  employmentType: EmploymentType
  status: JobStatus
  openings: number
  description: string | null
  createdAt: string
  closedAt: string | null
  createdBy: PersonRef | null
  counts: Record<Stage, number>
  total: number
  active: number
  hired: number
}

export type JobInput = {
  title: string
  department?: string | null
  location?: string | null
  workMode?: WorkMode
  employmentType?: EmploymentType
  status?: JobStatus
  openings?: number
  description?: string | null
}

export type JobSort = 'recent' | 'oldest' | 'applicants' | 'title'

export type JobsOverview = {
  openings: { value: number; addedRecently: number }
  applicants: { value: number; changePct: number | null }
  hired: { value: number; changePct: number | null }
  avgTimeToFill: { days: number | null; changePct: number | null }
  statusCounts: Record<JobStatus, number> & { total: number }
  topPositions: { id: string; title: string; applicants: number }[]
}

// ───────────────────────────── candidates ─────────────────────────────

export type CandidateSource = 'LINKEDIN' | 'REFERRAL' | 'CAREER_PAGE' | 'JOB_BOARD' | 'AGENCY' | 'OTHER'

export type Tag = { id: string; name: string; color: string }

export type Candidate = {
  id: string
  name: string
  email: string
  phone: string | null
  location: string | null
  currentStage: Stage
  source: CandidateSource
  yearsOfExperience: number
  job: { id: string; title: string } | null
  skills: string[]
  tags: Tag[]
  createdAt: string
  updatedAt: string
  /** When the candidate entered their current stage (ISO timestamp). */
  currentStageSince: string
  daysInCurrentStage: number
}

export type Experience = {
  id: string
  title: string
  company: string
  startDate: string
  endDate: string | null
  description: string | null
}

export type Education = {
  id: string
  degree: string
  fieldOfStudy: string | null
  institution: string
  startYear: number | null
  endYear: number | null
}

export type CandidateDetail = Candidate & {
  summary: string | null
  githubUrl: string | null
  linkedinUrl: string | null
  portfolioUrl: string | null
  resumeUrl: string | null
  experiences: Experience[]
  education: Education[]
}

export type CandidateInput = {
  name: string
  email: string
  jobId: string
  phone?: string | null
  location?: string | null
  source?: CandidateSource
  yearsOfExperience?: number
  summary?: string | null
  githubUrl?: string | null
  linkedinUrl?: string | null
  portfolioUrl?: string | null
  resumeUrl?: string | null
  skills?: string[]
}

export type CandidateSort = 'latest' | 'oldest' | 'name' | 'stage' | 'longest-in-stage'
export type ExperienceLevel = 'fresher' | 'junior' | 'mid' | 'senior'

export type CandidateQuery = {
  q?: string
  jobId?: string
  stage?: Stage
  experience?: ExperienceLevel
  tagId?: string
  sort?: CandidateSort
  page?: number
  pageSize?: number
}

export type CandidatePage = { items: Candidate[]; total: number; page: number; pageSize: number }

export type StageCounts = { counts: Record<Stage, number>; total: number }

/** One row of a candidate's audit trail. Read-only: the API exposes no way to change it. */
export type StageHistoryEntry = {
  id: string
  fromStage: Stage
  toStage: Stage
  changedAt: string
  changedBy: PersonRef | null
}

export type Note = { id: string; body: string; createdAt: string; author: PersonRef }

export type TagWithCount = Tag & { candidateCount: number }

// ───────────────────────────── search ─────────────────────────────

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

export type GlobalSearchResponse = {
  candidates: Candidate[]
  jobs: { id: string; title: string; status: JobStatus }[]
  skills: { name: string; candidateCount: number }[]
  interviews: Interview[]
}

// ───────────────────────────── interviews ─────────────────────────────

export type InterviewType = 'INITIAL' | 'TECHNICAL' | 'HR' | 'PANEL' | 'HIRING_MANAGER' | 'OFFER_DISCUSSION'
export type MeetingPlatform = 'ZOOM' | 'GOOGLE_MEET' | 'PHONE' | 'ON_SITE'
export type InterviewStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'

export type Interview = {
  id: string
  type: InterviewType
  status: InterviewStatus
  startsAt: string
  endsAt: string
  durationMinutes: number
  platform: MeetingPlatform
  meetingLink: string | null
  location: string | null
  notes: string | null
  candidate: { id: string; name: string; currentStage: Stage; job: { id: string; title: string } | null }
  interviewers: PersonRef[]
  createdBy: PersonRef
}

export type ScheduleInterviewInput = {
  candidateId: string
  type: InterviewType
  startsAt: string
  durationMinutes: number
  platform: MeetingPlatform
  meetingLink?: string | null
  location?: string | null
  notes?: string | null
  interviewerIds?: string[]
}

export type UpdateInterviewInput = Partial<Omit<ScheduleInterviewInput, 'candidateId'>> & {
  status?: 'COMPLETED' | 'CANCELLED'
}

export type InterviewStats = { today: number; week: number; upcoming: number; offers: number }

// ───────────────────────────── home & feeds ─────────────────────────────

export type Metric = { value: number; changePct: number | null; series: number[] }

export type Dashboard = {
  period: { days: number; from: string; to: string }
  stats: { total: Metric; inProgress: Metric; hired: Metric; rejected: Metric }
  pipeline: { stage: Stage; count: number; candidates: Candidate[] }[]
  rejectedCount: number
}

export type ActivityType =
  | 'CANDIDATE_ADDED'
  | 'STAGE_CHANGED'
  | 'NOTE_ADDED'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_RESCHEDULED'
  | 'INTERVIEW_CANCELLED'
  | 'INTERVIEW_COMPLETED'

export type ActivityItem = {
  id: string
  type: ActivityType
  summary: string
  stage: Stage | null
  createdAt: string
  candidate: { id: string; name: string } | null
  actor: PersonRef | null
}

export type ActivityPage = { items: ActivityItem[]; nextBefore: string | null }

export type AppNotification = {
  id: string
  title: string
  body: string | null
  href: string | null
  read: boolean
  createdAt: string
}

export type NotificationsResponse = { unreadCount: number; items: AppNotification[] }
