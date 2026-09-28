import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Stage } from "@prisma/client";
import { prisma } from "../../src/db/prisma";
import { createCandidate, transitionCandidateStage } from "../../src/services/candidate.service";
import { CandidateNotFoundError, InvalidTransitionError } from "../../src/domain/errors";
import { getBaseline, resetDatabase } from "../helpers/db";

let emailCounter = 0;
function makeCandidate(overrides: Partial<{ name: string; email: string }> = {}) {
  emailCounter += 1;
  return createCandidate({
    name: overrides.name ?? "Test Candidate",
    email: overrides.email ?? `candidate-${emailCounter}@example.com`,
    jobId: getBaseline().job.id,
    source: "OTHER",
    yearsOfExperience: 0,
  });
}

async function historyFor(candidateId: string) {
  return prisma.stageHistory.findMany({
    where: { candidateId },
    orderBy: { changedAt: "asc" },
  });
}

beforeEach(async () => {
  await resetDatabase();
  emailCounter = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createCandidate", () => {
  it("creates a candidate at the Applied stage with no history yet", async () => {
    const candidate = await makeCandidate();
    expect(candidate.currentStage).toBe(Stage.APPLIED);
    expect(await historyFor(candidate.id)).toHaveLength(0);
  });
});

describe("transitionCandidateStage — valid transitions", () => {
  it("moves the candidate forward one stage and records a history row", async () => {
    const candidate = await makeCandidate();

    const updated = await transitionCandidateStage(candidate.id, Stage.SCREENING);

    expect(updated.currentStage).toBe(Stage.SCREENING);
    const history = await historyFor(candidate.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStage: Stage.APPLIED, toStage: Stage.SCREENING });
  });

  it("records history for every hop along the full forward path", async () => {
    const candidate = await makeCandidate();
    const path: Stage[] = [Stage.SCREENING, Stage.INTERVIEW, Stage.OFFER, Stage.HIRED];

    for (const [index, stage] of path.entries()) {
      await transitionCandidateStage(candidate.id, stage);
      const history = await historyFor(candidate.id);
      expect(history).toHaveLength(index + 1);
      expect(history[index].toStage).toBe(stage);
    }

    const final = await prisma.candidate.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(final.currentStage).toBe(Stage.HIRED);
  });

  it.each([Stage.APPLIED, Stage.SCREENING, Stage.INTERVIEW, Stage.OFFER])(
    "allows %s to be rejected",
    async (stage) => {
      const candidate = await makeCandidate();

      // Walk forward to the stage under test before rejecting from it.
      const order = [Stage.APPLIED, Stage.SCREENING, Stage.INTERVIEW, Stage.OFFER];
      const targetIndex = order.indexOf(stage);
      for (let i = 1; i <= targetIndex; i++) {
        await transitionCandidateStage(candidate.id, order[i]);
      }

      const rejected = await transitionCandidateStage(candidate.id, Stage.REJECTED);
      expect(rejected.currentStage).toBe(Stage.REJECTED);

      const history = await historyFor(candidate.id);
      expect(history.at(-1)).toMatchObject({ fromStage: stage, toStage: Stage.REJECTED });
    },
  );
});

describe("transitionCandidateStage — invalid transitions", () => {
  it("rejects skipping a stage and makes no changes", async () => {
    const candidate = await makeCandidate();

    await expect(transitionCandidateStage(candidate.id, Stage.INTERVIEW)).rejects.toThrow(
      InvalidTransitionError,
    );

    const reloaded = await prisma.candidate.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(reloaded.currentStage).toBe(Stage.APPLIED);
    expect(await historyFor(candidate.id)).toHaveLength(0);
  });

  it("rejects moving backwards and makes no changes", async () => {
    const candidate = await makeCandidate();
    await transitionCandidateStage(candidate.id, Stage.SCREENING);

    await expect(transitionCandidateStage(candidate.id, Stage.APPLIED)).rejects.toThrow(
      InvalidTransitionError,
    );

    const reloaded = await prisma.candidate.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(reloaded.currentStage).toBe(Stage.SCREENING);
    expect(await historyFor(candidate.id)).toHaveLength(1);
  });

  it("Hired is final: rejects any further transition, including to Rejected", async () => {
    const candidate = await makeCandidate();
    for (const stage of [Stage.SCREENING, Stage.INTERVIEW, Stage.OFFER, Stage.HIRED]) {
      await transitionCandidateStage(candidate.id, stage);
    }

    await expect(transitionCandidateStage(candidate.id, Stage.REJECTED)).rejects.toThrow(
      InvalidTransitionError,
    );

    const reloaded = await prisma.candidate.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(reloaded.currentStage).toBe(Stage.HIRED);
    expect(await historyFor(candidate.id)).toHaveLength(4);
  });

  it("Rejected is final: rejects any further transition", async () => {
    const candidate = await makeCandidate();
    await transitionCandidateStage(candidate.id, Stage.REJECTED);

    await expect(transitionCandidateStage(candidate.id, Stage.SCREENING)).rejects.toThrow(
      InvalidTransitionError,
    );

    const reloaded = await prisma.candidate.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(reloaded.currentStage).toBe(Stage.REJECTED);
    expect(await historyFor(candidate.id)).toHaveLength(1);
  });

  it("throws CandidateNotFoundError for an unknown candidate id and writes nothing", async () => {
    await expect(transitionCandidateStage("does-not-exist", Stage.SCREENING)).rejects.toThrow(
      CandidateNotFoundError,
    );

    expect(await prisma.stageHistory.count()).toBe(0);
  });
});

describe("transaction atomicity", () => {
  it("rolls back the candidate update if the history insert in the same transaction fails", async () => {
    const candidate = await makeCandidate();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.candidate.update({
          where: { id: candidate.id },
          data: { currentStage: Stage.SCREENING },
        });

        // fromStage === toStage violates the StageHistory check constraint,
        // forcing this second write to fail inside the same transaction
        // that already applied the candidate update above.
        await tx.stageHistory.create({
          data: {
            candidateId: candidate.id,
            fromStage: Stage.SCREENING,
            toStage: Stage.SCREENING,
            changedAt: new Date(),
          },
        });
      }),
    ).rejects.toThrow();

    const reloaded = await prisma.candidate.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(reloaded.currentStage).toBe(Stage.APPLIED);
    expect(await historyFor(candidate.id)).toHaveLength(0);
  });
});

describe("concurrent transitions on the same candidate", () => {
  /** A trustworthy trail is a chain: each row starts where the previous one ended, ending at currentStage. */
  async function expectConsistentTrail(candidateId: string) {
    const history = await historyFor(candidateId);
    const current = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId } });

    let expectedFrom: Stage = Stage.APPLIED;
    for (const row of history) {
      expect(row.fromStage).toBe(expectedFrom);
      expectedFrom = row.toStage;
    }
    expect(current.currentStage).toBe(expectedFrom);
  }

  it("lets exactly one of two identical simultaneous moves win, and rejects the other", async () => {
    // Repeated because the race window is narrow: a single attempt can get lucky.
    for (let i = 0; i < 15; i++) {
      const candidate = await makeCandidate();

      const results = await Promise.allSettled([
        transitionCandidateStage(candidate.id, Stage.SCREENING),
        transitionCandidateStage(candidate.id, Stage.SCREENING),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(InvalidTransitionError);
      expect(await historyFor(candidate.id)).toHaveLength(1);
      await expectConsistentTrail(candidate.id);
    }
  });

  it("never lets a rejected candidate be moved forward by a simultaneous request", async () => {
    // Whichever request runs first, the result must be a valid chain: either Applied->Screening->Rejected,
    // or Applied->Rejected with the move refused. Never both starting from Applied.
    for (let i = 0; i < 15; i++) {
      const candidate = await makeCandidate();

      await Promise.allSettled([
        transitionCandidateStage(candidate.id, Stage.SCREENING),
        transitionCandidateStage(candidate.id, Stage.REJECTED),
      ]);

      await expectConsistentTrail(candidate.id);
      const final = await prisma.candidate.findUniqueOrThrow({ where: { id: candidate.id } });
      expect(final.currentStage).toBe(Stage.REJECTED); // Rejected is final: nothing may move it afterwards
    }
  });
});
