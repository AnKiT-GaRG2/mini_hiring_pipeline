import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { InterviewType } from "@prisma/client";
import { prisma } from "../../src/db/prisma";
import { createJob, getBaseline, resetDatabase } from "../helpers/db";
import { api } from "../helpers/http";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function candidate(name: string, skills: string[] = []) {
  const res = await api.post("/api/candidates").send({ name, email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`, jobId: getBaseline().job.id, skills });
  return res.body as { id: string };
}

/** Writes an interview straight to the database, for times the API refuses (the past). */
async function insertInterview(candidateId: string, startsAt: Date, minutes = 30, type: InterviewType = InterviewType.TECHNICAL) {
  return prisma.interview.create({
    data: {
      candidateId,
      type,
      startsAt,
      endsAt: new Date(startsAt.getTime() + minutes * 60 * 1000),
      createdById: getBaseline().manager.id,
      interviewers: { create: [{ userId: getBaseline().manager.id }] },
    },
  });
}

describe("GET /api/search/global (the top-bar quick search)", () => {
  it("finds candidates by name, email or skill; jobs by title; and skills with how many candidates have them", async () => {
    await candidate("Reena Kapoor", ["React", "Redux"]);
    await candidate("Rahul Mehta", ["React"]);
    await candidate("Vikram Nair", ["Go"]);
    await createJob({ title: "React Native Developer" });

    const res = await api.get("/api/search/global?q=rea");
    expect(res.status).toBe(200);
    expect(res.body.candidates.map((c: { name: string }) => c.name)).toEqual(["Rahul Mehta", "Reena Kapoor"]); // by skill: React
    expect(res.body.jobs.map((j: { title: string }) => j.title)).toEqual(["React Native Developer"]);
    expect(res.body.skills).toEqual([{ name: "React", candidateCount: 2 }]);
  });

  it("puts matches that start with the text first", async () => {
    await candidate("Anand Rao");
    await candidate("Kiran Anand");
    await candidate("Anaya Bose");

    const names = (await api.get("/api/search/global?q=ana")).body.candidates.map((c: { name: string }) => c.name);
    expect(names).toEqual(["Anand Rao", "Anaya Bose", "Kiran Anand"]);
  });

  it("returns at most five of each kind", async () => {
    for (let i = 0; i < 7; i++) await candidate(`Sam ${i}`, [`Samba${i}`]);
    const res = (await api.get("/api/search/global?q=sam")).body;
    expect(res.candidates).toHaveLength(5);
    expect(res.skills).toHaveLength(5);
  });

  it("returns empty lists when nothing matches, and 400 for an empty query", async () => {
    await candidate("Someone");
    const res = await api.get("/api/search/global?q=zzz");
    expect(res.body).toEqual({ candidates: [], jobs: [], skills: [], interviews: [] });
    expect((await api.get("/api/search/global?q=")).status).toBe(400);
    expect((await api.get("/api/search/global")).status).toBe(400);
  });

  it("is not the natural-language search: a sentence is just text here", async () => {
    await candidate("Priya Sharma");
    const res = await api.get("/api/search/global").query({ q: "who is in screening" });
    expect(res.body.candidates).toEqual([]);
  });
});

describe("GET /api/search/global — interviews", () => {
  const HOUR = 3600e3;
  const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * HOUR).toISOString();

  async function schedule(name: string, type: string, hoursFromNow: number) {
    const c = await candidate(name);
    const res = await api.post("/api/interviews").send({ candidateId: c.id, type, startsAt: at(hoursFromNow), durationMinutes: 30 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as { id: string };
  }

  it("the bare word 'interview' finds the soonest upcoming interviews of any kind", async () => {
    const past = await candidate("Past One");
    await insertInterview(past.id, new Date(Date.now() - 5 * HOUR)); // already started: not "upcoming"
    const soon = await schedule("Soon One", "HR", 2);
    const later = await schedule("Later One", "PANEL", 30);

    const res = await api.get("/api/search/global?q=interview");
    expect(res.status).toBe(200);
    expect(res.body.interviews.map((i: { id: string }) => i.id)).toEqual([soon.id, later.id]);
  });

  it("a specific kind narrows to that type only", async () => {
    await schedule("Tech Candidate", "TECHNICAL", 3);
    const hr = await schedule("HR Candidate", "HR", 4);

    const res = await api.get("/api/search/global?q=hr interview");
    expect(res.body.interviews.map((i: { id: string }) => i.id)).toEqual([hr.id]);
    expect(res.body.interviews[0].type).toBe("HR");
  });

  it("recognises 'hiring manager' as a phrase, not the plain word 'manager'", async () => {
    const hm = await schedule("Round Candidate", "HIRING_MANAGER", 5);
    const withPhrase = await api.get("/api/search/global?q=hiring manager");
    expect(withPhrase.body.interviews.map((i: { id: string }) => i.id)).toEqual([hm.id]);
  });

  it("does not treat a name like 'Harish' as matching the keyword 'hr'", async () => {
    await schedule("Harish Rao", "TECHNICAL", 6);
    const res = await api.get("/api/search/global?q=harish");
    expect(res.body.interviews).toEqual([]);
    expect(res.body.candidates.map((c: { name: string }) => c.name)).toEqual(["Harish Rao"]);
  });

  it("a day phrase finds interviews on that day, of any kind, including ones already past", async () => {
    const today = await schedule("Today Candidate", "INITIAL", 1);
    await schedule("Tomorrow Candidate", "INITIAL", 26);

    const res = await api.get("/api/search/global?q=today");
    expect(res.body.interviews.map((i: { id: string }) => i.id)).toEqual([today.id]);
  });

  it("combines a kind and a day phrase", async () => {
    const match = await schedule("Match Candidate", "PANEL", 26);
    await schedule("Other Kind Tomorrow", "HR", 27);
    await schedule("Right Kind Today", "PANEL", 2);

    const res = await api.get("/api/search/global?q=panel tomorrow");
    expect(res.body.interviews.map((i: { id: string }) => i.id)).toEqual([match.id]);
  });

  it("excludes cancelled interviews", async () => {
    const cancelled = await schedule("Cancelled Candidate", "TECHNICAL", 2);
    await api.patch(`/api/interviews/${cancelled.id}`).send({ status: "CANCELLED" });

    const res = await api.get("/api/search/global?q=interview");
    expect(res.body.interviews).toEqual([]);
  });

  it("finds no more than five, soonest first", async () => {
    for (let i = 0; i < 7; i++) await schedule(`Bulk ${i}`, "TECHNICAL", i + 1);
    const res = await api.get("/api/search/global?q=interview");
    expect(res.body.interviews).toHaveLength(5);
    const times = res.body.interviews.map((i: { startsAt: string }) => i.startsAt);
    expect([...times].sort()).toEqual(times);
  });
});

describe("GET /api/search/global — predicts from a partial word", () => {
  const HOUR = 3600e3;
  const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * HOUR).toISOString();

  it("a 3-letter prefix of an interview kind already narrows to it", async () => {
    const c = await candidate("Tech Candidate");
    const res1 = await api.post("/api/interviews").send({ candidateId: c.id, type: "TECHNICAL", startsAt: at(3), durationMinutes: 30 });
    expect(res1.status).toBe(201);

    const res = await api.get("/api/search/global?q=tec");
    expect(res.body.interviews).toHaveLength(1);
    expect(res.body.interviews[0].type).toBe("TECHNICAL");
  });

  it("does not predict below 3 letters", async () => {
    const c = await candidate("Tech Candidate");
    await api.post("/api/interviews").send({ candidateId: c.id, type: "TECHNICAL", startsAt: at(3), durationMinutes: 30 });

    const res = await api.get("/api/search/global?q=te");
    expect(res.body.interviews).toEqual([]);
  });

  it("a stage word — even a 3-letter prefix — finds who's currently in it, once text search comes up empty", async () => {
    const rejected = await candidate("Rejected Candidate");
    await api.post(`/api/candidates/${rejected.id}/reject`);
    await candidate("Applied Candidate");

    const full = await api.get("/api/search/global?q=rejected");
    expect(full.body.candidates.map((c: { name: string }) => c.name)).toEqual(["Rejected Candidate"]);

    const prefix = await api.get("/api/search/global?q=rej");
    expect(prefix.body.candidates.map((c: { name: string }) => c.name)).toEqual(["Rejected Candidate"]);
  });

  it("a literal name/email/skill match always wins over a stage word", async () => {
    // Named "Applied", but actually rejected — the literal name match should still win.
    const tricky = await candidate("Applied Person");
    await api.post(`/api/candidates/${tricky.id}/reject`);

    const res = await api.get("/api/search/global?q=applied");
    expect(res.body.candidates.map((c: { name: string }) => c.name)).toEqual(["Applied Person"]);
  });
});
