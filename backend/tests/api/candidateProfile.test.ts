import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { JobStatus, Stage, UserRole } from "@prisma/client";
import { prisma } from "../../src/db/prisma";
import { seedCandidate } from "../helpers/candidates";
import { createJob, createUser, getBaseline, resetDatabase } from "../helpers/db";
import { as, api } from "../helpers/http";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

type Body = Record<string, unknown>;

async function create(overrides: Body = {}) {
  const res = await api.post("/api/candidates").send({
    name: "Test Candidate",
    email: `c-${Math.random().toString(36).slice(2)}@example.com`,
    jobId: getBaseline().job.id,
    ...overrides,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; name: string; currentStage: Stage; currentStageSince: string; updatedAt: string };
}

const names = (body: { items: { name: string }[] }) => body.items.map((c) => c.name);

describe("creating a candidate with a full profile", () => {
  const full = {
    name: "Ananya Iyer",
    email: "Ananya@Example.com",
    phone: "+91-98123-45678",
    location: "Bengaluru, India",
    source: "REFERRAL",
    yearsOfExperience: 4,
    summary: "Frontend engineer.",
    githubUrl: "https://github.com/ananya",
    linkedinUrl: "https://linkedin.com/in/ananya",
    skills: ["React", " TypeScript ", "react", ""],
    experiences: [{ title: "Engineer", company: "Zenith", startDate: "2022-01-15", endDate: null, description: "Built things" }],
    education: [{ degree: "B.Tech", fieldOfStudy: "CS", institution: "IIT Delhi", startYear: 2016, endYear: 2020 }],
  };

  it("stores and returns the whole profile", async () => {
    const res = await api.post("/api/candidates").send({ ...full, jobId: getBaseline().job.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Ananya Iyer",
      email: "ananya@example.com",
      location: "Bengaluru, India",
      source: "REFERRAL",
      yearsOfExperience: 4,
      summary: "Frontend engineer.",
      githubUrl: "https://github.com/ananya",
      job: { id: getBaseline().job.id, title: "Test Engineer" },
      skills: ["React", "TypeScript"], // trimmed, blanks and case-insensitive duplicates dropped, order kept
      experiences: [{ title: "Engineer", company: "Zenith", startDate: "2022-01-15", endDate: null }],
      education: [{ degree: "B.Tech", institution: "IIT Delhi", startYear: 2016, endYear: 2020 }],
    });
  });

  it("defaults source to OTHER and experience to 0", async () => {
    const c = await create();
    const res = await api.get(`/api/candidates/${c.id}`);
    expect(res.body).toMatchObject({ source: "OTHER", yearsOfExperience: 0, skills: [], tags: [] });
  });

  it("requires a job, and the job must exist", async () => {
    const noJob = await api.post("/api/candidates").send({ name: "X", email: "x@example.com" });
    expect(noJob.status).toBe(400);
    expect(noJob.body.details[0].path).toBe("jobId");

    const unknown = await api.post("/api/candidates").send({ name: "X", email: "x@example.com", jobId: "nope" });
    expect(unknown.status).toBe(404);
  });

  it("rejects malformed profile fields", async () => {
    const base = { name: "X", email: "x@example.com", jobId: getBaseline().job.id };
    const bad = async (extra: Body) => (await api.post("/api/candidates").send({ ...base, ...extra })).status;

    expect(await bad({ githubUrl: "ftp://nope" })).toBe(400);
    expect(await bad({ yearsOfExperience: 61 })).toBe(400);
    expect(await bad({ yearsOfExperience: 2.5 })).toBe(400);
    expect(await bad({ source: "TELEPATHY" })).toBe(400);
    expect(await bad({ skills: Array.from({ length: 31 }, (_, i) => `skill-${i}`) })).toBe(400);
    expect(await bad({ experiences: [{ title: "T", company: "C", startDate: "2024-05-01", endDate: "2023-01-01" }] })).toBe(400);
    expect(await bad({ experiences: [{ title: "T", company: "C", startDate: "not-a-date" }] })).toBe(400);
    expect(await bad({ education: [{ degree: "D", institution: "I", startYear: 2020, endYear: 2019 }] })).toBe(400);
  });
});

describe("PATCH /api/candidates/:id", () => {
  it("edits profile fields and clears optional ones with null", async () => {
    const c = await create({ phone: "123", location: "Delhi" });
    const res = await api.patch(`/api/candidates/${c.id}`).send({ name: "Renamed", phone: null, yearsOfExperience: 7 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Renamed", phone: null, location: "Delhi", yearsOfExperience: 7 });
  });

  it("cannot change the stage — only a transition can — and does not restart the time in stage", async () => {
    const c = await create();
    const moved = await api.post(`/api/candidates/${c.id}/transition`).send({ toStage: "SCREENING" });
    await new Promise((r) => setTimeout(r, 15));

    const res = await api.patch(`/api/candidates/${c.id}`).send({ name: "Edited", currentStage: "HIRED", stageEnteredAt: "2000-01-01T00:00:00Z" });

    expect(res.status).toBe(200);
    expect(res.body.currentStage).toBe("SCREENING");
    expect(res.body.currentStageSince).toBe(moved.body.currentStageSince);
    expect(res.body.updatedAt).not.toBe(moved.body.updatedAt); // the edit is real…
    expect(await prisma.stageHistory.count({ where: { candidateId: c.id } })).toBe(1); // …but the audit trail is untouched
  });

  it("replaces skills, experience and education wholesale when supplied, and leaves them alone otherwise", async () => {
    const c = await create({ skills: ["Old"], education: [{ degree: "B.Sc", institution: "Somewhere" }] });

    const untouched = await api.patch(`/api/candidates/${c.id}`).send({ name: "Same lists" });
    expect(untouched.body.skills).toEqual(["Old"]);
    expect(untouched.body.education).toHaveLength(1);

    const replaced = await api.patch(`/api/candidates/${c.id}`).send({ skills: ["New", "Newer"], education: [] });
    expect(replaced.body.skills).toEqual(["New", "Newer"]);
    expect(replaced.body.education).toEqual([]);
  });

  it("moves a candidate to another open job, but not to a closed or missing one", async () => {
    const c = await create();
    const other = await createJob({ title: "Other role" });
    const closed = await createJob({ title: "Closed role", status: JobStatus.CLOSED });

    const moved = await api.patch(`/api/candidates/${c.id}`).send({ jobId: other.id });
    expect(moved.body.job.title).toBe("Other role");

    expect((await api.patch(`/api/candidates/${c.id}`).send({ jobId: closed.id })).status).toBe(409);
    expect((await api.patch(`/api/candidates/${c.id}`).send({ jobId: "nope" })).status).toBe(404);
  });

  it("rejects an email another candidate already has", async () => {
    await create({ email: "taken@example.com" });
    const c = await create();
    const res = await api.patch(`/api/candidates/${c.id}`).send({ email: "taken@example.com" });
    expect(res.status).toBe(409);
  });

  it("answers 404 for an unknown candidate and 400 for invalid data", async () => {
    expect((await api.patch("/api/candidates/nope").send({ name: "x" })).status).toBe(404);
    const c = await create();
    expect((await api.patch(`/api/candidates/${c.id}`).send({ email: "bad" })).status).toBe(400);
  });
});

describe("GET /api/candidates (filters, sorting, paging)", () => {
  it("searches name, email and skills, ignoring case", async () => {
    await create({ name: "Priya Sharma", email: "priya@example.com", skills: ["Figma"] });
    await create({ name: "Rahul Mehta", email: "rahul@corp.io", skills: ["React", "Node.js"] });

    expect(names((await api.get("/api/candidates?q=PRIYA")).body)).toEqual(["Priya Sharma"]);
    expect(names((await api.get("/api/candidates?q=corp.io")).body)).toEqual(["Rahul Mehta"]);
    expect(names((await api.get("/api/candidates?q=node")).body)).toEqual(["Rahul Mehta"]);
    expect((await api.get("/api/candidates?q=nobody")).body.total).toBe(0);
  });

  it("filters by job, stage and experience level", async () => {
    const other = await createJob({ title: "Other" });
    await create({ name: "Fresher", yearsOfExperience: 0 });
    await create({ name: "Junior", yearsOfExperience: 2 });
    await create({ name: "Mid", yearsOfExperience: 4, jobId: other.id });
    await create({ name: "Senior", yearsOfExperience: 9 });
    const mid = (await api.get("/api/candidates?q=Mid")).body.items[0];
    await api.post(`/api/candidates/${mid.id}/transition`).send({ toStage: "SCREENING" });

    expect(names((await api.get(`/api/candidates?jobId=${other.id}`)).body)).toEqual(["Mid"]);
    expect(names((await api.get("/api/candidates?stage=SCREENING")).body)).toEqual(["Mid"]);
    for (const [bucket, expected] of [["fresher", "Fresher"], ["junior", "Junior"], ["mid", "Mid"], ["senior", "Senior"]]) {
      expect(names((await api.get(`/api/candidates?experience=${bucket}`)).body), bucket).toEqual([expected]);
    }
  });

  it("filters by tag", async () => {
    const tagged = await create({ name: "Tagged" });
    await create({ name: "Plain" });
    const tag = await api.post(`/api/candidates/${tagged.id}/tags`).send({ name: "Referral" });

    expect(names((await api.get(`/api/candidates?tagId=${tag.body.id}`)).body)).toEqual(["Tagged"]);
  });

  it("combines filters (all must match)", async () => {
    await create({ name: "Both", skills: ["React"], yearsOfExperience: 4 });
    await create({ name: "Only React", skills: ["React"], yearsOfExperience: 0 });
    expect(names((await api.get("/api/candidates?q=react&experience=mid")).body)).toEqual(["Both"]);
  });

  it("sorts newest first by default, and by oldest, name and longest in stage", async () => {
    await seedCandidate({ name: "Charlie", appliedDaysAgo: 5, path: [{ stage: Stage.SCREENING, daysAgo: 4 }] });
    await seedCandidate({ name: "Alice", appliedDaysAgo: 10, path: [{ stage: Stage.SCREENING, daysAgo: 9 }] });
    await seedCandidate({ name: "Bob", appliedDaysAgo: 1 });

    const sorted = async (sort?: string) => names((await api.get(`/api/candidates${sort ? `?sort=${sort}` : ""}`)).body);
    expect(await sorted()).toEqual(["Bob", "Charlie", "Alice"]);
    expect(await sorted("latest")).toEqual(["Bob", "Charlie", "Alice"]);
    expect(await sorted("oldest")).toEqual(["Alice", "Charlie", "Bob"]);
    expect(await sorted("name")).toEqual(["Alice", "Bob", "Charlie"]);
    expect(await sorted("longest-in-stage")).toEqual(["Alice", "Charlie", "Bob"]);
  });

  it("pages through results without repeating or skipping anyone", async () => {
    for (let i = 1; i <= 5; i++) await seedCandidate({ name: `Person ${i}`, appliedDaysAgo: 10 - i });

    const seen: string[] = [];
    for (const page of [1, 2, 3]) {
      const res = await api.get(`/api/candidates?pageSize=2&page=${page}`);
      expect(res.body).toMatchObject({ total: 5, page, pageSize: 2 });
      seen.push(...names(res.body));
    }
    expect(seen).toEqual(["Person 5", "Person 4", "Person 3", "Person 2", "Person 1"]);
    expect(names((await api.get("/api/candidates?pageSize=2&page=4")).body)).toEqual([]);
  });

  it("rejects bad paging and sort values", async () => {
    for (const query of ["page=0", "pageSize=0", "pageSize=101", "sort=random", "experience=guru"]) {
      expect((await api.get(`/api/candidates?${query}`)).status, query).toBe(400);
    }
  });

  it("includes what the list needs: job, skills, tags and time in stage", async () => {
    const c = await create({ name: "Full", skills: ["React", "Go"] });
    await api.post(`/api/candidates/${c.id}/tags`).send({ name: "Referral" });
    const item = (await api.get("/api/candidates")).body.items[0];
    expect(item).toMatchObject({ name: "Full", skills: ["React", "Go"], job: { title: "Test Engineer" }, daysInCurrentStage: 0 });
    expect(item.tags).toEqual([expect.objectContaining({ name: "Referral" })]);
  });
});

describe("GET /api/candidates/counts", () => {
  it("counts candidates per stage, optionally for one job", async () => {
    const other = await createJob({ title: "Other" });
    await seedCandidate({ name: "A" });
    await seedCandidate({ name: "B", path: [{ stage: Stage.SCREENING, daysAgo: 1 }] });
    await seedCandidate({ name: "C", jobId: other.id, path: [{ stage: Stage.REJECTED, daysAgo: 1 }] });

    const all = await api.get("/api/candidates/counts");
    expect(all.body.total).toBe(3);
    expect(all.body.counts).toEqual({ APPLIED: 1, SCREENING: 1, INTERVIEW: 0, OFFER: 0, HIRED: 0, REJECTED: 1 });

    const one = await api.get(`/api/candidates/counts?jobId=${other.id}`);
    expect(one.body.total).toBe(1);
    expect(one.body.counts.REJECTED).toBe(1);
  });
});

describe("GET /api/candidates/export.csv", () => {
  it("downloads the filtered candidates as a spreadsheet", async () => {
    await create({ name: "Priya Sharma", email: "priya@example.com", skills: ["React", "Node.js"], location: "Pune" });
    await create({ name: "Rahul, Jr.", email: "rahul@example.com" });

    const res = await api.get("/api/candidates/export.csv?sort=name");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toBe('attachment; filename="candidates.csv"');

    const lines = res.text.trim().split("\r\n");
    expect(lines[0]).toBe("Name,Email,Phone,Position,Stage,Source,Location,Years of experience,Skills,Tags,Applied,Days in stage");
    expect(lines[1]).toContain("Priya Sharma,priya@example.com,,Test Engineer,APPLIED,OTHER,Pune,0,React; Node.js,");
    expect(lines[2]).toContain('"Rahul, Jr."');
    expect(lines).toHaveLength(3);
  });

  it("respects the same filters as the list, and a hand-picked selection", async () => {
    const a = await create({ name: "Alpha" });
    await create({ name: "Beta" });
    await api.post(`/api/candidates/${a.id}/transition`).send({ toStage: "SCREENING" });

    const byStage = await api.get("/api/candidates/export.csv?stage=SCREENING");
    expect(byStage.text.trim().split("\r\n")).toHaveLength(2);
    expect(byStage.text).toContain("Alpha");

    const picked = await api.get(`/api/candidates/export.csv?ids=${a.id},unknown-id`);
    expect(picked.text.trim().split("\r\n")).toHaveLength(2);
  });

  it("neutralises spreadsheet formulas in candidate names", async () => {
    await create({ name: '=HYPERLINK("http://evil","click")' });
    const res = await api.get("/api/candidates/export.csv");
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil"",""click"")"`);
  });
});

describe("notes", () => {
  it("adds a note as the acting member and lists newest first", async () => {
    const c = await create();
    const recruiter = await createUser({ name: "Rita", role: UserRole.RECRUITER });

    const first = await as(recruiter).post(`/api/candidates/${c.id}/notes`).send({ body: "  First impression  " });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ body: "First impression", author: { id: recruiter.id, name: "Rita" } });
    await prisma.note.update({ where: { id: first.body.id }, data: { createdAt: new Date(Date.now() - 60_000) } });

    await api.post(`/api/candidates/${c.id}/notes`).send({ body: "Second thought" });

    const list = await api.get(`/api/candidates/${c.id}/notes`);
    expect(list.body.map((n: { body: string }) => n.body)).toEqual(["Second thought", "First impression"]);
  });

  it("validates the note and the candidate", async () => {
    const c = await create();
    expect((await api.post(`/api/candidates/${c.id}/notes`).send({ body: "   " })).status).toBe(400);
    expect((await api.post(`/api/candidates/${c.id}/notes`).send({ body: "x".repeat(4001) })).status).toBe(400);
    expect((await api.post("/api/candidates/nope/notes").send({ body: "hi" })).status).toBe(404);
    expect((await api.get("/api/candidates/nope/notes")).status).toBe(404);
  });

  it("lets authors delete their own notes, and managers anyone's, but not recruiters each other's", async () => {
    const c = await create();
    const rita = await createUser({ role: UserRole.RECRUITER });
    const sam = await createUser({ role: UserRole.RECRUITER });
    const note = async (user: { id: string }) => (await as(user).post(`/api/candidates/${c.id}/notes`).send({ body: "note" })).body.id as string;

    expect((await as(sam).delete(`/api/notes/${await note(rita)}`)).status).toBe(403);
    expect((await as(rita).delete(`/api/notes/${await note(rita)}`)).status).toBe(204);
    expect((await api.delete(`/api/notes/${await note(rita)}`)).status).toBe(204); // the acting manager
    expect((await api.delete("/api/notes/nope")).status).toBe(404);
  });
});

describe("tags", () => {
  it("creates a tag on first use and reuses it (any casing) afterwards", async () => {
    const a = await create({ name: "A" });
    const b = await create({ name: "B" });

    const first = await api.post(`/api/candidates/${a.id}/tags`).send({ name: "High potential" });
    const second = await api.post(`/api/candidates/${b.id}/tags`).send({ name: "high POTENTIAL" });

    expect(first.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.color).toBe(first.body.color);
    expect(await prisma.tag.count()).toBe(1);
  });

  it("is idempotent: attaching the same tag twice leaves one link", async () => {
    const a = await create();
    await api.post(`/api/candidates/${a.id}/tags`).send({ name: "Referral" });
    const again = await api.post(`/api/candidates/${a.id}/tags`).send({ name: "Referral" });
    expect(again.status).toBe(201);
    expect(await prisma.candidateTag.count()).toBe(1);
  });

  it("shows tags on the candidate and counts them in the tag list", async () => {
    const a = await create({ name: "A" });
    const b = await create({ name: "B" });
    await api.post(`/api/candidates/${a.id}/tags`).send({ name: "Referral" });
    await api.post(`/api/candidates/${b.id}/tags`).send({ name: "Referral" });
    await api.post(`/api/candidates/${b.id}/tags`).send({ name: "Remote only" });

    expect((await api.get(`/api/candidates/${b.id}`)).body.tags.map((t: { name: string }) => t.name).sort()).toEqual(["Referral", "Remote only"]);
    const list = await api.get("/api/tags");
    expect(list.body.map((t: { name: string; candidateCount: number }) => [t.name, t.candidateCount])).toEqual([["Referral", 2], ["Remote only", 1]]);
  });

  it("removes a tag from a candidate without deleting the tag", async () => {
    const a = await create();
    const tag = (await api.post(`/api/candidates/${a.id}/tags`).send({ name: "Referral" })).body;

    expect((await api.delete(`/api/candidates/${a.id}/tags/${tag.id}`)).status).toBe(204);
    expect((await api.delete(`/api/candidates/${a.id}/tags/${tag.id}`)).status).toBe(404);
    expect((await api.get("/api/tags")).body).toHaveLength(1);
  });

  it("validates the tag and the candidate", async () => {
    const a = await create();
    expect((await api.post(`/api/candidates/${a.id}/tags`).send({ name: " " })).status).toBe(400);
    expect((await api.post(`/api/candidates/${a.id}/tags`).send({ name: "x".repeat(31) })).status).toBe(400);
    expect((await api.post(`/api/candidates/${a.id}/tags`).send({ name: "ok", color: "chartreuse" })).status).toBe(400);
    expect((await api.post("/api/candidates/nope/tags").send({ name: "ok" })).status).toBe(404);
  });
});
