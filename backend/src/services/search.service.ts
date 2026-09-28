import { InterviewStatus, InterviewType, Prisma, Stage } from "@prisma/client";
import { prisma } from "../db/prisma";
import { ParsedFilters } from "../search/queryParser";
import { parseDayPhrase } from "../search/dateWords";
import { matchOneOf, soleWord } from "../search/wordMatch";
import { candidateSummaryInclude, CandidateSummaryRow } from "../controllers/candidate.presenter";
import { interviewInclude, toInterviewResponse } from "./interview.service";

/**
 * Thresholds calibrated empirically against the seed data using
 * word_similarity() (not similarity()) — word_similarity finds the
 * best-matching *substring* of a multi-word name, which is what makes
 * "sharam" score ~0.57 against "Priya Sharma" instead of being diluted by
 * the unrelated "Priya " prefix. See README's "Search ranking" section for
 * the calibration data.
 */
const STRONG_FUZZY_THRESHOLD = 0.45;
const MIN_MATCH_THRESHOLD = 0.3;

const STAGE_ORDER: Stage[] = [
  Stage.APPLIED,
  Stage.SCREENING,
  Stage.INTERVIEW,
  Stage.OFFER,
  Stage.HIRED,
  Stage.REJECTED,
];

/**
 * Why a candidate matched the name query, so the UI can say so:
 * - exact:  the whole name equals the query
 * - prefix: the name starts with the query
 * - word:   the query is a whole word (or words) inside the name, e.g. "Sharma"
 * - fuzzy:  close but not identical, e.g. the typo "sharam"
 */
export type NameMatchType = "exact" | "prefix" | "word" | "fuzzy";

export type RankedCandidate = {
  candidate: CandidateSummaryRow;
  score: number | null;
  /** null when the query had no name part, so there is nothing to explain. */
  matchType: NameMatchType | null;
};

const EXACT_TIER = 3;
const PREFIX_TIER = 2;
// word_similarity() is 1 exactly when the query appears as whole word(s) in the name.
const WHOLE_WORD_SCORE = 0.999;

function toMatchType(row: { tier: number; score: number }): NameMatchType {
  if (row.tier === EXACT_TIER) return "exact";
  if (row.tier === PREFIX_TIER) return "prefix";
  return row.score >= WHOLE_WORD_SCORE ? "word" : "fuzzy";
}

function durationCutoff(durationDays: number, now: Date): Date {
  return new Date(now.getTime() - durationDays * 24 * 60 * 60 * 1000);
}

function buildStructuralWhere(filters: ParsedFilters, now: Date): Prisma.CandidateWhereInput {
  const and: Prisma.CandidateWhereInput[] = [];

  if (filters.currentStage) {
    and.push({ currentStage: filters.currentStage });
  }

  if (filters.excludeStages && filters.excludeStages.length > 0) {
    and.push({ currentStage: { notIn: filters.excludeStages } });
  }

  if (filters.currentStageDuration) {
    const cutoff = durationCutoff(filters.currentStageDuration.durationDays, now);
    switch (filters.currentStageDuration.operator) {
      case ">":
        and.push({ stageEnteredAt: { lt: cutoff } });
        break;
      case ">=":
        and.push({ stageEnteredAt: { lte: cutoff } });
        break;
      case "<":
        and.push({ stageEnteredAt: { gt: cutoff } });
        break;
      case "<=":
        and.push({ stageEnteredAt: { gte: cutoff } });
        break;
      case "=": {
        const dayStart = new Date(cutoff);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        and.push({ stageEnteredAt: { gte: dayStart, lt: dayEnd } });
        break;
      }
    }
  }

  if (filters.movedToStage) {
    and.push({
      stageHistory: {
        some: {
          toStage: filters.movedToStage.stage,
          ...(filters.movedToStage.since ? { changedAt: { gte: filters.movedToStage.since } } : {}),
        },
      },
    });
  }

  if (filters.reachedStageNotHired) {
    and.push({ stageHistory: { some: { toStage: filters.reachedStageNotHired } } });
    and.push({ currentStage: { not: Stage.HIRED } });
  }

  return and.length > 0 ? { AND: and } : {};
}

function sortByPipelineOrder(candidates: CandidateSummaryRow[]): CandidateSummaryRow[] {
  return [...candidates].sort((a, b) => {
    const stageDiff = STAGE_ORDER.indexOf(a.currentStage) - STAGE_ORDER.indexOf(b.currentStage);
    return stageDiff !== 0 ? stageDiff : a.name.localeCompare(b.name);
  });
}

type NameMatchRow = { id: string; score: number; tier: number };

/**
 * Ranks the given (already structurally-filtered) candidate ids by name
 * match quality using PostgreSQL's pg_trgm word_similarity(), tiered per
 * the spec: exact > prefix > strong fuzzy > other. Rows below
 * MIN_MATCH_THRESHOLD are dropped entirely rather than ranked last.
 */
async function rankByName(ids: string[], nameQuery: string): Promise<NameMatchRow[]> {
  return prisma.$queryRaw<NameMatchRow[]>`
    SELECT
      id,
      word_similarity(lower(${nameQuery}), lower(name)) AS score,
      CASE
        WHEN lower(name) = lower(${nameQuery}) THEN 3
        WHEN lower(name) LIKE lower(${nameQuery}) || '%' THEN 2
        WHEN word_similarity(lower(${nameQuery}), lower(name)) >= ${STRONG_FUZZY_THRESHOLD} THEN 1
        WHEN word_similarity(lower(${nameQuery}), lower(name)) >= ${MIN_MATCH_THRESHOLD} THEN 0
        ELSE -1
      END AS tier
    FROM "Candidate"
    WHERE id = ANY(${ids})
    ORDER BY tier DESC, score DESC, name ASC
  `;
}

export async function searchCandidates(
  filters: ParsedFilters,
  now: Date = new Date(),
): Promise<RankedCandidate[]> {
  const where = buildStructuralWhere(filters, now);
  const structurallyFiltered = await prisma.candidate.findMany({ where, include: candidateSummaryInclude });

  if (!filters.name) {
    return sortByPipelineOrder(structurallyFiltered).map((candidate) => ({
      candidate,
      score: null,
      matchType: null,
    }));
  }

  if (structurallyFiltered.length === 0) return [];

  const ids = structurallyFiltered.map((c) => c.id);
  const ranked = await rankByName(ids, filters.name.query);
  const byId = new Map(structurallyFiltered.map((c) => [c.id, c]));

  return ranked
    .filter((row) => row.tier >= 0)
    .map((row) => ({ candidate: byId.get(row.id)!, score: row.score, matchType: toMatchType(row) }));
}

const GLOBAL_LIMIT = 5;

const ALL_INTERVIEW_TYPES = Object.values(InterviewType);

// One canonical word per interview kind, keyed the way it's typed. "interview"
// is deliberately the generic, all-kinds entry — matching it is how the bare
// word "interview" finds something.
const INTERVIEW_TYPE_WORDS: Record<string, InterviewType[]> = {
  interview: ALL_INTERVIEW_TYPES,
  initial: [InterviewType.INITIAL],
  technical: [InterviewType.TECHNICAL],
  hr: [InterviewType.HR],
  panel: [InterviewType.PANEL],
  hiring: [InterviewType.HIRING_MANAGER],
  offer: [InterviewType.OFFER_DISCUSSION],
};

// The same words, but matched as whole words anywhere in a longer, multi-word
// query ("hr interview", "panel tomorrow"), where prefix prediction doesn't
// apply — typing stops being ambiguous once a whole word is there to match.
const SPECIFIC_INTERVIEW_TYPE_KEYWORDS: { pattern: RegExp; types: InterviewType[] }[] = [
  { pattern: /\binitial\b/i, types: [InterviewType.INITIAL] },
  { pattern: /\btechnical\b/i, types: [InterviewType.TECHNICAL] },
  { pattern: /\bhr\b/i, types: [InterviewType.HR] },
  { pattern: /\bpanel\b/i, types: [InterviewType.PANEL] },
  { pattern: /\b(?:hiring manager|manager round|hiring)\b/i, types: [InterviewType.HIRING_MANAGER] },
  { pattern: /\boffer(?:\s+discussion)?\b/i, types: [InterviewType.OFFER_DISCUSSION] },
];

/**
 * The union of interview types the query names, or null if it names none.
 * A specific kind ("hr", "panel", …) narrows to just that kind; the bare word
 * "interview(s)" only broadens to every kind when no specific one was named —
 * so "hr interview" still means HR, not every interview. A single word also
 * matches from a 3-letter prefix ("tech" → Technical), so the quick search
 * starts predicting before it's fully typed.
 */
function interviewTypesFor(q: string): InterviewType[] | null {
  const word = soleWord(q);
  if (word) {
    const hit = matchOneOf(word, Object.keys(INTERVIEW_TYPE_WORDS));
    return hit ? INTERVIEW_TYPE_WORDS[hit] : null;
  }

  const matched = new Set<InterviewType>();
  for (const { pattern, types } of SPECIFIC_INTERVIEW_TYPE_KEYWORDS) {
    if (pattern.test(q)) for (const t of types) matched.add(t);
  }
  if (matched.size > 0) return [...matched];
  return /\binterviews?\b/i.test(q) ? ALL_INTERVIEW_TYPES : null;
}

// One canonical word per pipeline stage, keyed the way it's typed.
const STAGE_WORDS: Record<string, Stage> = {
  applied: Stage.APPLIED,
  screening: Stage.SCREENING,
  interview: Stage.INTERVIEW,
  offer: Stage.OFFER,
  hired: Stage.HIRED,
  rejected: Stage.REJECTED,
};

/**
 * The pipeline stage the query names, matching from a 3-letter prefix the
 * same way {@link interviewTypesFor} does ("hir" → Hired), or a whole word
 * anywhere in a longer query. Used only as a fallback (see {@link globalSearch})
 * when nobody's name, email or skill matched the text.
 */
function stageFor(q: string): Stage | undefined {
  const word = soleWord(q);
  if (word) {
    const hit = matchOneOf(word, Object.keys(STAGE_WORDS));
    if (hit) return STAGE_WORDS[hit];
  }
  for (const [w, stage] of Object.entries(STAGE_WORDS)) {
    if (new RegExp(`\\b${w}\\b`, "i").test(q)) return stage;
  }
  return undefined;
}

/**
 * The quick "jump to" search in the top bar: a few candidates, jobs and skills
 * whose text contains what was typed, plus:
 *  - when the query names an interview kind ("interview", "technical", "hr",
 *    …) or a day ("tomorrow", "sep 30", "next monday", "this week"), the
 *    interviews that match;
 *  - when nobody's name, email or skill matched but the query names a
 *    pipeline stage ("hired", "screening", …), who's currently in it.
 * A single word matches from a 3-letter prefix throughout, so results start
 * appearing before it's fully typed. Otherwise deliberately simple substring
 * matching — the natural-language search on the Candidates page is where the
 * smart parsing lives.
 */
export async function globalSearch(q: string, now: Date = new Date()) {
  const contains = { contains: q, mode: "insensitive" as const };
  const lower = q.toLowerCase();

  const dayRange = parseDayPhrase(q, now);
  const matchedTypes = interviewTypesFor(q);
  const matchedStage = stageFor(q);

  const [candidates, jobs, skills, interviews, stageCandidates] = await Promise.all([
    prisma.candidate.findMany({
      where: { OR: [{ name: contains }, { email: contains }, { skills: { some: { name: contains } } }] },
      include: candidateSummaryInclude,
      take: 25,
    }),
    prisma.job.findMany({
      where: { OR: [{ title: contains }, { department: contains }] },
      select: { id: true, title: true, status: true },
      take: 25,
    }),
    prisma.candidateSkill.groupBy({ by: ["name"], where: { name: contains }, _count: { _all: true }, orderBy: { name: "asc" }, take: 25 }),
    dayRange || matchedTypes
      ? prisma.interview.findMany({
          where: {
            status: { not: InterviewStatus.CANCELLED },
            ...(matchedTypes ? { type: { in: matchedTypes } } : {}),
            // No day named: default to what's coming up, not the whole history.
            startsAt: dayRange ? { gte: dayRange.from, lt: dayRange.to } : { gte: now },
          },
          include: interviewInclude,
          orderBy: [{ startsAt: "asc" }, { id: "asc" }],
          take: GLOBAL_LIMIT,
        })
      : Promise.resolve([]),
    matchedStage
      ? prisma.candidate.findMany({
          where: { currentStage: matchedStage },
          include: candidateSummaryInclude,
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          take: GLOBAL_LIMIT,
        })
      : Promise.resolve([]),
  ]);

  // Names that start with the text come first, then alphabetical.
  const rank = (name: string) => (name.toLowerCase().startsWith(lower) ? 0 : 1);
  const byRank = <T,>(get: (item: T) => string) => (a: T, b: T) => rank(get(a)) - rank(get(b)) || get(a).localeCompare(get(b));

  // A literal text match always wins; the stage only fills in when nothing else did.
  const candidateResults = candidates.length > 0 ? candidates.sort(byRank((c) => c.name)).slice(0, GLOBAL_LIMIT) : stageCandidates;

  return {
    candidates: candidateResults,
    jobs: jobs.sort(byRank((j) => j.title)).slice(0, GLOBAL_LIMIT),
    skills: skills
      .map((s) => ({ name: s.name, candidateCount: s._count._all }))
      .sort((a, b) => rank(a.name) - rank(b.name) || b.candidateCount - a.candidateCount || a.name.localeCompare(b.name))
      .slice(0, GLOBAL_LIMIT),
    interviews: interviews.map(toInterviewResponse),
  };
}
