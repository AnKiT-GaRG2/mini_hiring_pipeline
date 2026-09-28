import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { JobStatus, Stage, UserRole } from "@prisma/client";
import { prisma } from "../../src/db/prisma";
import { seedCandidate } from "../helpers/candidates";
import { createJob, createUser, getBaseline, resetDatabase } from "../helpers/db";
import { as, api } from "../helpers/http";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const daysAgoDate = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe("POST /api/jobs", () => {
  it("creates an active job with sensible defaults, attributed to the creator", async () => {
    const res = await api.post("/api/jobs").send({ title: "Data Analyst" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Data Analyst",
      status: "OPEN",
      workMode: "ON_SITE",
      employmentType: "FULL_TIME",
      openings: 1,
      total: 0,
      hired: 0,
      createdBy: { name: "Test Manager" },
    });
  });

  it("accepts the full set of fields", async () => {
    const res = await api.post("/api/jobs").send({
      title: "Platform Engineer",
      department: "Engineering",
      location: "Pune, India",
      workMode: "HYBRID",
      employmentType: "CONTRACT",
      openings: 3,
      description: "Keep the lights on.",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ department: "Engineering", location: "Pune, India", workMode: "HYBRID", employmentType: "CONTRACT", openings: 3 });
  });

  it("validates the input", async () => {
    const res = await api.post("/api/jobs").send({ title: "", openings: 0, workMode: "MOON" });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual(["openings", "title", "workMode"]);
  });

  it("is forbidden to recruiters", async () => {
    const recruiter = await createUser({ role: UserRole.RECRUITER });
    expect((await as(recruiter).post("/api/jobs").send({ title: "Nope" })).status).toBe(403);
  });
});

describe("GET /api/jobs", () => {
  it("counts applicants per stage for each job", async () => {
    const other = await createJob({ title: "Other" });
    await seedCandidate({ name: "A", path: [{ stage: Stage.SCREENING, daysAgo: 1 }] });
    await seedCandidate({ name: "B" });
    await seedCandidate({ name: "C", jobId: other.id });

    const res = await api.get("/api/jobs");
    const test = res.body.find((j: { title: string }) => j.title === "Test Engineer");
    const oth = res.body.find((j: { title: string }) => j.title === "Other");

    expect(test).toMatchObject({ total: 2, active: 2, hired: 0 });
    expect(test.counts).toMatchObject({ APPLIED: 1, SCREENING: 1, HIRED: 0 });
    expect(oth.total).toBe(1);
  });

  it("filters by status and by text", async () => {
    await createJob({ title: "Frontend Developer", status: JobStatus.PAUSED, department: "Engineering" });
    await createJob({ title: "Designer", status: JobStatus.CLOSED, department: "Design" });

    const paused = await api.get("/api/jobs?status=PAUSED");
    expect(paused.body.map((j: { title: string }) => j.title)).toEqual(["Frontend Developer"]);

    const text = await api.get("/api/jobs?q=design");
    expect(text.body.map((j: { title: string }) => j.title)).toEqual(["Designer"]);

    const dept = await api.get("/api/jobs?q=engineering");
    expect(dept.body.map((j: { title: string }) => j.title)).toEqual(["Frontend Developer"]);
  });

  it("sorts by recency (default), age, applicants and title", async () => {
    const old = await createJob({ title: "Zed", createdAt: daysAgoDate(50) });
    const mid = await createJob({ title: "Mid", createdAt: daysAgoDate(20) });
    await seedCandidate({ name: "A", jobId: old.id });
    await seedCandidate({ name: "B", jobId: old.id });
    await seedCandidate({ name: "C", jobId: mid.id });
    const titles = async (sort: string) => (await api.get(`/api/jobs?sort=${sort}`)).body.map((j: { title: string }) => j.title);

    expect(await titles("recent")).toEqual(["Test Engineer", "Mid", "Zed"]);
    expect(await titles("oldest")).toEqual(["Zed", "Mid", "Test Engineer"]);
    expect(await titles("applicants")).toEqual(["Zed", "Mid", "Test Engineer"]);
    expect(await titles("title")).toEqual(["Mid", "Test Engineer", "Zed"]);
    expect((await api.get("/api/jobs")).body.map((j: { title: string }) => j.title)).toEqual(await titles("recent"));
  });

  it("rejects an unknown status or sort with 400", async () => {
    expect((await api.get("/api/jobs?status=DRAFT")).status).toBe(400);
    expect((await api.get("/api/jobs?sort=random")).status).toBe(400);
  });
});

describe("GET /api/jobs/:id and PATCH /api/jobs/:id", () => {
  it("returns one job, or 404", async () => {
    const { job } = getBaseline();
    expect((await api.get(`/api/jobs/${job.id}`)).body.title).toBe("Test Engineer");
    expect((await api.get("/api/jobs/nope")).status).toBe(404);
  });

  it("edits a job", async () => {
    const { job } = getBaseline();
    const res = await api.patch(`/api/jobs/${job.id}`).send({ title: "Senior Test Engineer", workMode: "REMOTE" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "Senior Test Engineer", workMode: "REMOTE" });
  });

  it("stamps closedAt when a job closes and clears it when it reopens", async () => {
    const { job } = getBaseline();
    const closed = await api.patch(`/api/jobs/${job.id}`).send({ status: "CLOSED" });
    expect(closed.body.closedAt).toEqual(expect.any(String));

    const reopened = await api.patch(`/api/jobs/${job.id}`).send({ status: "OPEN" });
    expect(reopened.body.closedAt).toBeNull();
  });

  it("keeps closedAt when the status does not change", async () => {
    const { job } = getBaseline();
    const first = await api.patch(`/api/jobs/${job.id}`).send({ status: "CLOSED" });
    const second = await api.patch(`/api/jobs/${job.id}`).send({ status: "CLOSED", title: "Renamed" });
    expect(second.body.closedAt).toBe(first.body.closedAt);
  });

  it("answers 404 when editing a job that does not exist, and 403 to recruiters", async () => {
    expect((await api.patch("/api/jobs/nope").send({ title: "x" })).status).toBe(404);
    const recruiter = await createUser({ role: UserRole.RECRUITER });
    expect((await as(recruiter).patch(`/api/jobs/${getBaseline().job.id}`).send({ title: "x" })).status).toBe(403);
  });

  it("stops accepting new candidates once a job is paused or closed", async () => {
    const { job } = getBaseline();
    for (const status of ["PAUSED", "CLOSED"]) {
      await api.patch(`/api/jobs/${job.id}`).send({ status });
      const res = await api.post("/api/candidates").send({ name: "Late", email: `late-${status}@example.com`, jobId: job.id });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/isn.t accepting candidates/i);
    }
  });
});

describe("GET /api/jobs/overview", () => {
  it("is all zeros with nothing to report", async () => {
    await prisma.job.deleteMany();
    const res = await api.get("/api/jobs/overview");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      openings: { value: 0, addedRecently: 0 },
      applicants: { value: 0, changePct: null },
      hired: { value: 0, changePct: null },
      avgTimeToFill: { days: null, changePct: null },
      statusCounts: { OPEN: 0, PAUSED: 0, CLOSED: 0, total: 0 },
      topPositions: [],
    });
  });

  it("summarises jobs, applicants, hires and time to hire against the previous 30 days", async () => {
    await createJob({ title: "Paused role", status: JobStatus.PAUSED, createdAt: daysAgoDate(3) });
    await createJob({ title: "Old closed role", status: JobStatus.CLOSED, createdAt: daysAgoDate(100) });

    // Hired 5 days ago after applying 20 days ago (15 days) — in the last 30 days.
    await seedCandidate({
      name: "Recent hire",
      appliedDaysAgo: 20,
      path: [
        { stage: Stage.SCREENING, daysAgo: 18 },
        { stage: Stage.INTERVIEW, daysAgo: 14 },
        { stage: Stage.OFFER, daysAgo: 8 },
        { stage: Stage.HIRED, daysAgo: 5 },
      ],
    });
    // Hired 40 days ago after applying 50 days ago (10 days) — in the 30 days before that.
    await seedCandidate({
      name: "Earlier hire",
      appliedDaysAgo: 50,
      path: [
        { stage: Stage.SCREENING, daysAgo: 48 },
        { stage: Stage.INTERVIEW, daysAgo: 46 },
        { stage: Stage.OFFER, daysAgo: 43 },
        { stage: Stage.HIRED, daysAgo: 40 },
      ],
    });
    await seedCandidate({ name: "Newcomer", appliedDaysAgo: 10 });

    const res = await api.get("/api/jobs/overview");
    expect(res.body.openings).toEqual({ value: 2, addedRecently: 2 }); // Test Engineer + Paused role; Old closed role doesn't count
    expect(res.body.statusCounts).toEqual({ OPEN: 1, PAUSED: 1, CLOSED: 1, total: 3 });
    expect(res.body.applicants).toEqual({ value: 3, changePct: 100 }); // 2 applied in the last 30 days vs 1 before
    expect(res.body.hired).toEqual({ value: 2, changePct: 0 }); // 1 hire vs 1 hire
    expect(res.body.avgTimeToFill).toEqual({ days: 13, changePct: 50 }); // (15 + 10) / 2 ≈ 12.5 → 13; 15 vs 10 days → +50%
  });

  it("lists the five jobs with the most applicants, busiest first", async () => {
    const jobs = [];
    for (let i = 0; i < 6; i++) jobs.push(await createJob({ title: `Role ${i}` }));
    for (const [i, job] of jobs.entries()) {
      for (let n = 0; n <= i; n++) await seedCandidate({ name: `Cand ${i}-${n}`, jobId: job.id });
    }

    const res = await api.get("/api/jobs/overview");
    expect(res.body.topPositions.map((p: { title: string; applicants: number }) => [p.title, p.applicants])).toEqual([
      ["Role 5", 6],
      ["Role 4", 5],
      ["Role 3", 4],
      ["Role 2", 3],
      ["Role 1", 2],
    ]);
  });
});
