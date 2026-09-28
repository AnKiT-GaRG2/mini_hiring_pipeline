import { describe, it, expect } from "vitest";
import { Stage } from "@prisma/client";
import { toCandidateResponse, toStageHistoryResponse } from "../../src/controllers/candidate.presenter";

function fakeCandidate(overrides: Partial<Parameters<typeof toCandidateResponse>[0]> = {}) {
  const base = {
    id: "c1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: null,
    currentStage: Stage.SCREENING,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  return { ...base, ...overrides };
}

describe("toCandidateResponse", () => {
  it("computes daysInCurrentStage from updatedAt (current-stage start time)", () => {
    const candidate = fakeCandidate({ updatedAt: new Date("2026-01-01T00:00:00.000Z") });
    const now = new Date("2026-01-09T12:00:00.000Z"); // 8.5 days later

    const result = toCandidateResponse(candidate, now);

    expect(result.currentStageSince).toBe("2026-01-01T00:00:00.000Z");
    expect(result.daysInCurrentStage).toBe(8);
  });

  it("reports 0 days for a candidate that just changed stage", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const candidate = fakeCandidate({ updatedAt: now });

    expect(toCandidateResponse(candidate, now).daysInCurrentStage).toBe(0);
  });

  it("passes through candidate fields unchanged", () => {
    const candidate = fakeCandidate({ phone: "+1-555-0100" });
    const result = toCandidateResponse(candidate, new Date());

    expect(result).toMatchObject({
      id: "c1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+1-555-0100",
      currentStage: Stage.SCREENING,
    });
  });
});

describe("toStageHistoryResponse", () => {
  it("serializes a history row with an ISO timestamp", () => {
    const result = toStageHistoryResponse({
      id: "h1",
      candidateId: "c1",
      fromStage: Stage.APPLIED,
      toStage: Stage.SCREENING,
      changedAt: new Date("2026-02-01T10:00:00.000Z"),
    });

    expect(result).toEqual({
      id: "h1",
      fromStage: Stage.APPLIED,
      toStage: Stage.SCREENING,
      changedAt: "2026-02-01T10:00:00.000Z",
    });
  });
});
