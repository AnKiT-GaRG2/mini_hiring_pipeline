import { Candidate, Prisma, Stage, StageHistory } from "@prisma/client";
import { prisma } from "../db/prisma";
import { validateTransition } from "../domain/stageTransitions";
import {
  CandidateNotFoundError,
  DuplicateEmailError,
  InvalidTransitionError,
} from "../domain/errors";

export type CreateCandidateInput = {
  name: string;
  email: string;
  phone?: string | null;
};

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

export async function createCandidate(input: CreateCandidateInput): Promise<Candidate> {
  try {
    return await prisma.candidate.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === UNIQUE_CONSTRAINT_VIOLATION
    ) {
      throw new DuplicateEmailError(input.email);
    }
    throw err;
  }
}

export type ListCandidatesFilter = {
  stage?: Stage;
};

export function listCandidates(filter: ListCandidatesFilter = {}): Promise<Candidate[]> {
  return prisma.candidate.findMany({
    where: filter.stage ? { currentStage: filter.stage } : undefined,
    orderBy: [{ currentStage: "asc" }, { updatedAt: "asc" }],
  });
}

export async function getCandidateById(candidateId: string): Promise<Candidate> {
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) throw new CandidateNotFoundError(candidateId);
  return candidate;
}

export async function getCandidateHistory(candidateId: string): Promise<StageHistory[]> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true },
  });
  if (!candidate) throw new CandidateNotFoundError(candidateId);

  return prisma.stageHistory.findMany({
    where: { candidateId },
    orderBy: { changedAt: "asc" },
  });
}

/**
 * Moves a candidate to `toStage`, validating the transition and recording an
 * immutable StageHistory row in one database transaction.
 *
 * The timestamp is always taken server-side (`new Date()`), never accepted
 * from a caller — a future HTTP layer must not be able to backdate audit
 * history through this entrypoint. Seed data, which legitimately needs
 * historical timestamps, writes directly via Prisma instead of through this
 * service (see prisma/seed.ts).
 */
export async function transitionCandidateStage(
  candidateId: string,
  toStage: Stage,
): Promise<Candidate> {
  return prisma.$transaction(async (tx) => {
    // Lock the row before reading it. A transaction makes the two writes atomic, but on its own
    // it doesn't stop two requests validating against the same stale read (both see "Applied",
    // one rejects, one advances, and a rejected candidate ends up in Screening). With the lock,
    // the second request waits, then reads the state the first one committed and is judged
    // against that — so it gets the correct "final stage" / "already in stage" error.
    await tx.$queryRaw`SELECT "id" FROM "Candidate" WHERE "id" = ${candidateId} FOR UPDATE`;

    const candidate = await tx.candidate.findUnique({ where: { id: candidateId } });

    if (!candidate) {
      throw new CandidateNotFoundError(candidateId);
    }

    const result = validateTransition(candidate.currentStage, toStage);

    if (!result.valid) {
      throw new InvalidTransitionError(candidate.currentStage, toStage, result.reason);
    }

    const changedAt = new Date();

    const updated = await tx.candidate.update({
      where: { id: candidateId },
      data: { currentStage: toStage, updatedAt: changedAt },
    });

    await tx.stageHistory.create({
      data: {
        candidateId,
        fromStage: candidate.currentStage,
        toStage,
        changedAt,
      },
    });

    return updated;
  });
}
