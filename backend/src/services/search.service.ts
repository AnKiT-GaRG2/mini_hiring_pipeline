import { Candidate, Prisma, Stage } from "@prisma/client";
import { prisma } from "../db/prisma";
import { ParsedFilters } from "../search/queryParser";

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
  candidate: Candidate;
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
        and.push({ updatedAt: { lt: cutoff } });
        break;
      case ">=":
        and.push({ updatedAt: { lte: cutoff } });
        break;
      case "<":
        and.push({ updatedAt: { gt: cutoff } });
        break;
      case "<=":
        and.push({ updatedAt: { gte: cutoff } });
        break;
      case "=": {
        const dayStart = new Date(cutoff);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        and.push({ updatedAt: { gte: dayStart, lt: dayEnd } });
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

function sortByPipelineOrder(candidates: Candidate[]): Candidate[] {
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
  const structurallyFiltered = await prisma.candidate.findMany({ where });

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
