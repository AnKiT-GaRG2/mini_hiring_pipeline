import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { UserRole, UserStatus } from "@prisma/client";
import { prisma } from "../../src/db/prisma";
import { createJob, createUser, getBaseline, resetDatabase } from "../helpers/db";
import { as, api } from "../helpers/http";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function newCandidate(name: string, jobId = getBaseline().job.id, user?: { id: string }) {
  const res = await as(user).post("/api/candidates").send({ name, email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`, jobId });
  return res.body as { id: string };
}
const move = (id: string, toStage: string, user?: { id: string }) => as(user).post(`/api/candidates/${id}/transition`).send({ toStage });

describe("GET /api/activity", () => {
  it("narrates what happened, newest first", async () => {
    const c = await newCandidate("Priya Sharma");
    await move(c.id, "SCREENING");
    await move(c.id, "INTERVIEW");
    await api.post(`/api/candidates/${c.id}/notes`).send({ body: "Great call" });
    await move(c.id, "OFFER");
    await move(c.id, "HIRED");

    const res = await api.get("/api/activity");
    expect(res.status).toBe(200);
    expect(res.body.items.map((a: { summary: string }) => a.summary)).toEqual([
      "Priya Sharma was hired",
      "Priya Sharma received an offer",
      "Test Manager added a note on Priya Sharma",
      "Priya Sharma moved to Interview",
      "Priya Sharma moved to Screening",
      "Priya Sharma applied for Test Engineer",
    ]);
    expect(res.body.items[0]).toMatchObject({ type: "STAGE_CHANGED", stage: "HIRED", candidate: { name: "Priya Sharma" }, actor: { name: "Test Manager" } });
    expect(res.body.items.at(-1).stage).toBe("APPLIED");
  });

  it("words rejections and interview events", async () => {
    const c = await newCandidate("Rahul Mehta");
    await api.post("/api/interviews").send({ candidateId: c.id, type: "TECHNICAL", startsAt: new Date(Date.now() + 30 * 3600e3).toISOString() });
    await move(c.id, "REJECTED");

    const summaries = (await api.get("/api/activity")).body.items.map((a: { summary: string }) => a.summary);
    expect(summaries).toContain("Technical interview scheduled with Rahul Mehta");
    expect(summaries).toContain("Rahul Mehta was rejected");
  });

  it("filters by job and by candidate", async () => {
    const other = await createJob({ title: "Other" });
    const a = await newCandidate("Alpha");
    await newCandidate("Beta", other.id);

    const byJob = await api.get(`/api/activity?jobId=${other.id}`);
    expect(byJob.body.items.map((x: { candidate: { name: string } }) => x.candidate.name)).toEqual(["Beta"]);

    const byCandidate = await api.get(`/api/activity?candidateId=${a.id}`);
    expect(byCandidate.body.items).toHaveLength(1);
  });

  it("pages backwards through time with a cursor", async () => {
    const c = await newCandidate("Pager");
    await move(c.id, "SCREENING");
    await move(c.id, "INTERVIEW");

    const first = await api.get("/api/activity?limit=2");
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextBefore).toEqual(expect.any(String));

    const second = await api.get(`/api/activity?limit=2&before=${encodeURIComponent(first.body.nextBefore)}`);
    expect(second.body.items.map((a: { summary: string }) => a.summary)).toEqual(["Pager applied for Test Engineer"]);
    expect(second.body.nextBefore).toBeNull();
  });

  it("validates limit and cursor", async () => {
    expect((await api.get("/api/activity?limit=0")).status).toBe(400);
    expect((await api.get("/api/activity?limit=51")).status).toBe(400);
    expect((await api.get("/api/activity?before=yesterday")).status).toBe(400);
  });

  it("records nothing for a request that fails", async () => {
    const c = await newCandidate("Solo");
    await move(c.id, "INTERVIEW"); // skips a stage: refused
    expect((await api.get("/api/activity")).body.items).toHaveLength(1);
  });
});

describe("notifications", () => {
  it("tells the rest of the team when someone applies, but not the person who added them", async () => {
    const rita = await createUser({ name: "Rita", role: UserRole.RECRUITER });
    await newCandidate("Priya Sharma");

    const forRita = await as(rita).get("/api/notifications");
    expect(forRita.body.unreadCount).toBe(1);
    expect(forRita.body.items[0]).toMatchObject({ title: "Priya Sharma applied for Test Engineer", read: false });
    expect(forRita.body.items[0].href).toMatch(/^\/candidates\?open=/);

    expect((await api.get("/api/notifications")).body.items).toEqual([]); // the manager did it
  });

  it("notifies only on the moves worth interrupting for — offers, hires and rejections", async () => {
    const rita = await createUser({ role: UserRole.RECRUITER });
    const c = await newCandidate("Priya Sharma");
    await prisma.notification.deleteMany();

    await move(c.id, "SCREENING");
    await move(c.id, "INTERVIEW");
    expect((await as(rita).get("/api/notifications")).body.items).toHaveLength(0);

    await move(c.id, "OFFER");
    await move(c.id, "HIRED");
    const titles = (await as(rita).get("/api/notifications")).body.items.map((n: { title: string }) => n.title);
    expect(titles).toEqual(["Priya Sharma was hired", "Priya Sharma received an offer"]);
  });

  it("does not notify deactivated members", async () => {
    const gone = await createUser({ status: UserStatus.DEACTIVATED });
    await newCandidate("Priya Sharma");
    expect(await prisma.notification.count({ where: { userId: gone.id } })).toBe(0);
  });

  it("marks selected notifications read, or all of them", async () => {
    const rita = await createUser({ role: UserRole.RECRUITER });
    for (const name of ["One", "Two", "Three"]) await newCandidate(name);
    const list = (await as(rita).get("/api/notifications")).body;
    expect(list.unreadCount).toBe(3);

    const some = await as(rita).post("/api/notifications/read").send({ ids: [list.items[0].id] });
    expect(some.body.updated).toBe(1);
    const after = (await as(rita).get("/api/notifications")).body;
    expect(after.unreadCount).toBe(2);
    expect(after.items.filter((n: { read: boolean }) => n.read)).toHaveLength(1);

    const all = await as(rita).post("/api/notifications/read").send({});
    expect(all.body.updated).toBe(2);
    expect((await as(rita).get("/api/notifications")).body.unreadCount).toBe(0);
  });

  it("only ever touches the caller's own notifications", async () => {
    const rita = await createUser({ role: UserRole.RECRUITER });
    const sam = await createUser({ role: UserRole.RECRUITER });
    await newCandidate("Priya Sharma");
    const ritasFirst = (await as(rita).get("/api/notifications")).body.items[0].id;

    const res = await as(sam).post("/api/notifications/read").send({ ids: [ritasFirst] });
    expect(res.body.updated).toBe(0);
    expect((await as(rita).get("/api/notifications")).body.unreadCount).toBe(1);
  });

  it("returns the newest first, capped at thirty, while counting all the unread", async () => {
    const rita = await createUser({ role: UserRole.RECRUITER });
    await prisma.notification.createMany({
      data: Array.from({ length: 35 }, (_, i) => ({ userId: rita.id, title: `n${i}`, createdAt: new Date(Date.now() - i * 1000) })),
    });

    const res = (await as(rita).get("/api/notifications")).body;
    expect(res.items).toHaveLength(30);
    expect(res.items[0].title).toBe("n0");
    expect(res.unreadCount).toBe(35);
  });
});
