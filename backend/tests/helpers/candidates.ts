import { Stage } from "@prisma/client";
import { prisma } from "../../src/db/prisma";
import { getBaseline } from "./db";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export type Hop = { stage: Stage; daysAgo: number };

export type SeedCandidateInput = {
  name: string;
  email?: string;
  jobId?: string;
  appliedDaysAgo?: number;
  /** Chronological transitions away from APPLIED, oldest first. */
  path?: Hop[];
};

let counter = 0;

/**
 * Test-only: writes a candidate plus a backdated StageHistory chain directly
 * via Prisma. The public service deliberately never accepts timestamps, so
 * time-dependent search behaviour (duration, "since") can only be set up here.
 */
export async function seedCandidate(input: SeedCandidateInput) {
  counter += 1;
  const appliedDaysAgo = input.appliedDaysAgo ?? 30;
  const path = input.path ?? [];

  return prisma.$transaction(async (tx) => {
    const created = await tx.candidate.create({
      data: {
        name: input.name,
        email: input.email ?? `seeded-${counter}@example.com`,
        jobId: input.jobId ?? getBaseline().job.id,
        currentStage: Stage.APPLIED,
        createdAt: daysAgo(appliedDaysAgo),
        stageEnteredAt: daysAgo(appliedDaysAgo),
        updatedAt: daysAgo(appliedDaysAgo),
      },
    });

    let current: Stage = Stage.APPLIED;
    for (const hop of path) {
      const changedAt = daysAgo(hop.daysAgo);
      await tx.stageHistory.create({
        data: { candidateId: created.id, fromStage: current, toStage: hop.stage, changedAt },
      });
      await tx.candidate.update({
        where: { id: created.id },
        data: { currentStage: hop.stage, stageEnteredAt: changedAt, updatedAt: changedAt },
      });
      current = hop.stage;
    }

    return tx.candidate.findUniqueOrThrow({ where: { id: created.id } });
  });
}
