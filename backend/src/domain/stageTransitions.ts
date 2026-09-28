import { Stage } from "@prisma/client";

// Forward path a candidate walks through before Hired. Rejected sits outside
// this order — reachable from any non-final stage, but never a "step" in it.
const FORWARD_ORDER: Stage[] = [
  Stage.APPLIED,
  Stage.SCREENING,
  Stage.INTERVIEW,
  Stage.OFFER,
  Stage.HIRED,
];

const FINAL_STAGES: ReadonlySet<Stage> = new Set([Stage.HIRED, Stage.REJECTED]);

export type TransitionValidation =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Table of every stage a candidate may move to directly from a given stage.
 * Exposed for callers (e.g. a future "what can I do next" UI) that want the
 * allowed set without re-deriving it from validateTransition.
 */
export const ALLOWED_NEXT_STAGES: Readonly<Record<Stage, readonly Stage[]>> = {
  [Stage.APPLIED]: [Stage.SCREENING, Stage.REJECTED],
  [Stage.SCREENING]: [Stage.INTERVIEW, Stage.REJECTED],
  [Stage.INTERVIEW]: [Stage.OFFER, Stage.REJECTED],
  [Stage.OFFER]: [Stage.HIRED, Stage.REJECTED],
  [Stage.HIRED]: [],
  [Stage.REJECTED]: [],
};

export function validateTransition(from: Stage, to: Stage): TransitionValidation {
  if (from === Stage.HIRED) {
    return { valid: false, reason: "Hired is a final stage and cannot be changed." };
  }

  if (from === Stage.REJECTED) {
    return { valid: false, reason: "Rejected is a final stage and cannot be changed." };
  }

  if (to === Stage.REJECTED) {
    return { valid: true };
  }

  if (to === from) {
    return { valid: false, reason: `Candidate is already in the ${to} stage.` };
  }

  const fromIndex = FORWARD_ORDER.indexOf(from);
  const toIndex = FORWARD_ORDER.indexOf(to);

  if (toIndex === -1) {
    // Only reachable if `to` is somehow outside the forward path and not
    // REJECTED — not possible today given the Stage enum, but kept as an
    // explicit guard rather than a silent fallthrough.
    return { valid: false, reason: `${to} is not a valid destination stage.` };
  }

  if (toIndex < fromIndex) {
    return { valid: false, reason: `Cannot move backwards from ${from} to ${to}.` };
  }

  if (toIndex > fromIndex + 1) {
    return {
      valid: false,
      reason: `Cannot skip stages: ${from} must move to ${FORWARD_ORDER[fromIndex + 1]} before ${to}.`,
    };
  }

  return { valid: true };
}

export function isFinalStage(stage: Stage): boolean {
  return FINAL_STAGES.has(stage);
}
