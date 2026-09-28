import { Candidate, StageHistory } from "@prisma/client";

/**
 * `candidate.updatedAt` doubles as "time entered current stage": the only
 * writes a Candidate row ever receives are (a) creation, which sets
 * currentStage=Applied and updatedAt=createdAt, and (b) a stage transition,
 * which sets updatedAt to the transition's changedAt. Nothing else ever
 * updates a Candidate row, so updatedAt is exactly the start of the current
 * stage — no need to look up the latest StageHistory row separately.
 */
export function toCandidateResponse(candidate: Candidate, now: Date = new Date()) {
  const currentStageSince = candidate.updatedAt;
  const daysInCurrentStage = Math.floor(
    (now.getTime() - currentStageSince.getTime()) / (1000 * 60 * 60 * 24),
  );

  return {
    id: candidate.id,
    name: candidate.name,
    email: candidate.email,
    phone: candidate.phone,
    currentStage: candidate.currentStage,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
    currentStageSince: currentStageSince.toISOString(),
    daysInCurrentStage,
  };
}

export function toStageHistoryResponse(entry: StageHistory) {
  return {
    id: entry.id,
    fromStage: entry.fromStage,
    toStage: entry.toStage,
    changedAt: entry.changedAt.toISOString(),
  };
}
