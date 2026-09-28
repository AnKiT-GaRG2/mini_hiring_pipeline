import { Candidate, CandidateEducation, CandidateExperience, Prisma, StageHistory, User } from "@prisma/client";

const DAY_MS = 1000 * 60 * 60 * 24;

export const candidateSummaryInclude = {
  job: { select: { id: true, title: true } },
  skills: { orderBy: { position: "asc" } },
  tags: { include: { tag: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.CandidateInclude;

export const candidateDetailInclude = {
  ...candidateSummaryInclude,
  experiences: { orderBy: [{ endDate: { sort: "desc", nulls: "first" } }, { startDate: "desc" }] },
  education: { orderBy: [{ endYear: { sort: "desc", nulls: "first" } }] },
} satisfies Prisma.CandidateInclude;

export type CandidateSummaryRow = Prisma.CandidateGetPayload<{ include: typeof candidateSummaryInclude }>;
export type CandidateDetailRow = Prisma.CandidateGetPayload<{ include: typeof candidateDetailInclude }>;

/** A candidate row that may or may not have had its relations loaded. */
type CandidateLike = Candidate & Partial<Omit<CandidateDetailRow, keyof Candidate>>;

/**
 * `currentStageSince` is `stageEnteredAt`: a dedicated column that only a stage
 * transition writes, so editing a profile or adding a note never resets
 * "how long has this candidate been stuck here".
 */
export function toCandidateResponse(candidate: CandidateLike, now: Date = new Date()) {
  const currentStageSince = candidate.stageEnteredAt;
  const daysInCurrentStage = Math.floor((now.getTime() - currentStageSince.getTime()) / DAY_MS);

  return {
    id: candidate.id,
    name: candidate.name,
    email: candidate.email,
    phone: candidate.phone,
    location: candidate.location,
    currentStage: candidate.currentStage,
    source: candidate.source,
    yearsOfExperience: candidate.yearsOfExperience,
    job: candidate.job ?? null,
    skills: (candidate.skills ?? []).map((s) => s.name),
    tags: (candidate.tags ?? []).map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
    currentStageSince: currentStageSince.toISOString(),
    daysInCurrentStage,
  };
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toExperience(e: CandidateExperience) {
  return {
    id: e.id,
    title: e.title,
    company: e.company,
    startDate: isoDay(e.startDate),
    endDate: e.endDate ? isoDay(e.endDate) : null,
    description: e.description,
  };
}

function toEducation(e: CandidateEducation) {
  return {
    id: e.id,
    degree: e.degree,
    fieldOfStudy: e.fieldOfStudy,
    institution: e.institution,
    startYear: e.startYear,
    endYear: e.endYear,
  };
}

export function toCandidateDetailResponse(candidate: CandidateDetailRow, now: Date = new Date()) {
  return {
    ...toCandidateResponse(candidate, now),
    summary: candidate.summary,
    githubUrl: candidate.githubUrl,
    linkedinUrl: candidate.linkedinUrl,
    portfolioUrl: candidate.portfolioUrl,
    resumeUrl: candidate.resumeUrl,
    experiences: candidate.experiences.map(toExperience),
    education: candidate.education.map(toEducation),
  };
}

export function toStageHistoryResponse(entry: StageHistory & { changedBy?: Pick<User, "id" | "name"> | null }) {
  return {
    id: entry.id,
    fromStage: entry.fromStage,
    toStage: entry.toStage,
    changedAt: entry.changedAt.toISOString(),
    changedBy: entry.changedBy ?? null,
  };
}
