import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Stage } from "@prisma/client";
import { prisma } from "../../src/db/prisma";
import { seedCandidate } from "../helpers/candidates";
import { createJob, resetDatabase } from "../helpers/db";
import { api } from "../helpers/http";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("GET /api/dashboard", () => {
  it("is empty and well-formed with no candidates", async () => {
    const res = await api.get("/api/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.period.days).toBe(30);
    for (const metric of Object.values(res.body.stats) as { value: number; changePct: number | null; series: number[] }[]) {
      expect(metric).toMatchObject({ value: 0, changePct: null });
      expect(metric.series).toEqual(new Array(10).fill(0));
    }
    expect(res.body.pipeline.map((c: { stage: string; count: number }) => [c.stage, c.count])).toEqual([
      ["APPLIED", 0], ["SCREENING", 0], ["INTERVIEW", 0], ["OFFER", 0], ["HIRED", 0],
    ]);
    expect(res.body.rejectedCount).toBe(0);
  });

  describe("headline numbers over the last 30 days", () => {
    // Timeline (days ago):
    //   Newcomer  applied 10, still Applied
    //   Stuck     applied 45, Screening since 40
    //   OldHire   applied 50, hired 45          → a hire in the *previous* 30 days
    //   Rejected  applied 20, rejected 5        → a rejection in the last 30 days
    //   NewHire   applied 35, hired 2           → a hire in the last 30 days
    beforeEach(async () => {
      await seedCandidate({ name: "Newcomer", appliedDaysAgo: 10 });
      await seedCandidate({ name: "Stuck", appliedDaysAgo: 45, path: [{ stage: Stage.SCREENING, daysAgo: 40 }] });
      await seedCandidate({
        name: "OldHire",
        appliedDaysAgo: 50,
        path: [{ stage: Stage.SCREENING, daysAgo: 49 }, { stage: Stage.INTERVIEW, daysAgo: 48 }, { stage: Stage.OFFER, daysAgo: 47 }, { stage: Stage.HIRED, daysAgo: 45 }],
      });
      await seedCandidate({ name: "Rejected", appliedDaysAgo: 20, path: [{ stage: Stage.REJECTED, daysAgo: 5 }] });
      await seedCandidate({
        name: "NewHire",
        appliedDaysAgo: 35,
        path: [{ stage: Stage.SCREENING, daysAgo: 30 }, { stage: Stage.INTERVIEW, daysAgo: 20 }, { stage: Stage.OFFER, daysAgo: 10 }, { stage: Stage.HIRED, daysAgo: 2 }],
      });
    });

    it("shows everyone on file, with new applicants as the trend", async () => {
      const { total } = (await api.get("/api/dashboard")).body.stats;
      expect(total.value).toBe(5);
      // 2 people applied in the last 30 days (Newcomer, Rejected) against 3 in the 30 before (Stuck, OldHire, NewHire).
      expect(total.changePct).toBe(-33);
      expect(sum(total.series)).toBe(2);
    });

    it("counts who is still in progress, against the start of the period", async () => {
      const { inProgress } = (await api.get("/api/dashboard")).body.stats;
      // Now: Newcomer and Stuck. Thirty days ago: Stuck and NewHire (OldHire had been hired; Rejected and Newcomer hadn't applied).
      expect(inProgress.value).toBe(2);
      expect(inProgress.changePct).toBe(0);
      expect(inProgress.series.at(-1)).toBe(2);
      expect(inProgress.series).toHaveLength(10);
    });

    it("counts hires and rejections made in the period, against the period before", async () => {
      const { hired, rejected } = (await api.get("/api/dashboard")).body.stats;
      expect(hired).toMatchObject({ value: 1, changePct: 0 }); // NewHire now; OldHire before
      expect(sum(hired.series)).toBe(1);
      expect(rejected).toMatchObject({ value: 1, changePct: null }); // nothing to compare with
      expect(sum(rejected.series)).toBe(1);
    });

    it("puts each event in the right slice of the sparkline", async () => {
      const { hired } = (await api.get("/api/dashboard")).body.stats;
      // NewHire was hired 2 days ago: in the last of the ten 3-day slices.
      expect(hired.series.at(-1)).toBe(1);
    });

    it("supports 7 and 90 day periods", async () => {
      const week = (await api.get("/api/dashboard?days=7")).body;
      expect(week.period.days).toBe(7);
      expect(week.stats.total.series).toHaveLength(7);
      expect(week.stats.hired.value).toBe(1);
      expect(week.stats.rejected.value).toBe(1);

      const quarter = (await api.get("/api/dashboard?days=90")).body;
      expect(quarter.stats.hired.value).toBe(2);
      expect(quarter.stats.total.series).toHaveLength(10);
    });

    it("rejects other period lengths", async () => {
      expect((await api.get("/api/dashboard?days=15")).status).toBe(400);
      expect((await api.get("/api/dashboard?days=abc")).status).toBe(400);
    });
  });

  describe("pipeline board", () => {
    it("counts every stage and previews the three most recent arrivals in each", async () => {
      for (let i = 1; i <= 5; i++) await seedCandidate({ name: `Applicant ${i}`, appliedDaysAgo: 10 - i });
      await seedCandidate({ name: "In review", appliedDaysAgo: 8, path: [{ stage: Stage.SCREENING, daysAgo: 2 }] });
      await seedCandidate({ name: "Turned down", appliedDaysAgo: 8, path: [{ stage: Stage.REJECTED, daysAgo: 2 }] });

      const { pipeline, rejectedCount } = (await api.get("/api/dashboard")).body;
      const applied = pipeline.find((c: { stage: string }) => c.stage === "APPLIED");

      expect(applied.count).toBe(5);
      expect(applied.candidates.map((c: { name: string }) => c.name)).toEqual(["Applicant 5", "Applicant 4", "Applicant 3"]);
      expect(pipeline.find((c: { stage: string }) => c.stage === "SCREENING").candidates.map((c: { name: string }) => c.name)).toEqual(["In review"]);
      expect(rejectedCount).toBe(1);
    });

    it("includes what a card shows: job, skills and how long they have been there", async () => {
      await seedCandidate({ name: "Card", appliedDaysAgo: 3 });
      const card = (await api.get("/api/dashboard")).body.pipeline[0].candidates[0];
      expect(card).toMatchObject({ name: "Card", job: { title: "Test Engineer" }, daysInCurrentStage: 3, skills: [] });
    });

    it("keeps long-standing candidates on the board regardless of the period", async () => {
      await seedCandidate({ name: "Ancient", appliedDaysAgo: 200, path: [{ stage: Stage.SCREENING, daysAgo: 199 }] });
      const week = (await api.get("/api/dashboard?days=7")).body;
      expect(week.pipeline.find((c: { stage: string }) => c.stage === "SCREENING").count).toBe(1);
    });
  });

  it("can be narrowed to one job", async () => {
    const other = await createJob({ title: "Other" });
    await seedCandidate({ name: "Here", appliedDaysAgo: 2 });
    await seedCandidate({ name: "There", appliedDaysAgo: 2, jobId: other.id });
    await seedCandidate({ name: "Gone", appliedDaysAgo: 4, jobId: other.id, path: [{ stage: Stage.REJECTED, daysAgo: 1 }] });

    const all = (await api.get("/api/dashboard")).body;
    expect(all.stats.total.value).toBe(3);

    const narrowed = (await api.get(`/api/dashboard?jobId=${other.id}`)).body;
    expect(narrowed.stats.total.value).toBe(2);
    expect(narrowed.stats.rejected.value).toBe(1);
    expect(narrowed.pipeline[0].candidates.map((c: { name: string }) => c.name)).toEqual(["There"]);
    expect(narrowed.rejectedCount).toBe(1);
  });
});
