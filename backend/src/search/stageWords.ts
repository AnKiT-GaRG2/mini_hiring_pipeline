import { Stage } from "@prisma/client";

/**
 * Recruiter-facing words that map onto a Stage. Kept separate from the
 * parser so the vocabulary is easy to scan/extend without touching regex
 * logic.
 */
const STAGE_SYNONYMS: Record<string, Stage> = {
  applied: Stage.APPLIED,
  application: Stage.APPLIED,
  screening: Stage.SCREENING,
  screen: Stage.SCREENING,
  screened: Stage.SCREENING,
  interview: Stage.INTERVIEW,
  interviewing: Stage.INTERVIEW,
  interviewed: Stage.INTERVIEW,
  offer: Stage.OFFER,
  offered: Stage.OFFER,
  hired: Stage.HIRED,
  hire: Stage.HIRED,
  rejected: Stage.REJECTED,
  reject: Stage.REJECTED,
};

export function resolveStageWord(word: string): Stage | undefined {
  return STAGE_SYNONYMS[word.trim().toLowerCase()];
}

export const STAGE_DISPLAY_NAMES: Record<Stage, string> = {
  [Stage.APPLIED]: "Applied",
  [Stage.SCREENING]: "Screening",
  [Stage.INTERVIEW]: "Interview",
  [Stage.OFFER]: "Offer",
  [Stage.HIRED]: "Hired",
  [Stage.REJECTED]: "Rejected",
};
