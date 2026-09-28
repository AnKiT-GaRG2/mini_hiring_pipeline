import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { InterviewStatus, InterviewType, Stage, UserRole, UserStatus } from "@prisma/client";
import { prisma } from "../../src/db/prisma";
import { seedCandidate } from "../helpers/candidates";
import { createUser, getBaseline, resetDatabase } from "../helpers/db";
import { as, api } from "../helpers/http";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const HOUR = 60 * 60 * 1000;
const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * HOUR);
const iso = (hoursFromNow: number) => at(hoursFromNow).toISOString();

async function newCandidate(name = "Candidate") {
  const res = await api.post("/api/candidates").send({ name, email: `${name.toLowerCase().replace(/\s+/g, ".")}-${Math.random().toString(36).slice(2)}@example.com`, jobId: getBaseline().job.id });
  return res.body as { id: string; name: string };
}

async function schedule(candidateId: string, body: Record<string, unknown> = {}, user?: { id: string }) {
  return as(user).post("/api/interviews").send({ candidateId, type: "TECHNICAL", startsAt: iso(30), durationMinutes: 60, ...body });
}

/** Writes an interview straight to the database, for times the API refuses (the past). */
async function insertInterview(candidateId: string, startsAt: Date, minutes: number, extra: { status?: InterviewStatus; type?: InterviewType } = {}) {
  return prisma.interview.create({
    data: {
      candidateId,
      type: extra.type ?? InterviewType.TECHNICAL,
      startsAt,
      endsAt: new Date(startsAt.getTime() + minutes * 60 * 1000),
      status: extra.status ?? InterviewStatus.SCHEDULED,
      createdById: getBaseline().manager.id,
      interviewers: { create: [{ userId: getBaseline().manager.id }] },
    },
  });
}

describe("POST /api/interviews", () => {
  it("schedules an interview, defaulting to 45 minutes on Google Meet with the scheduler as interviewer", async () => {
    const c = await newCandidate("Priya Sharma");
    const res = await api.post("/api/interviews").send({ candidateId: c.id, type: "INITIAL", startsAt: "2099-01-05T09:00:00Z" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: "INITIAL",
      status: "SCHEDULED",
      startsAt: "2099-01-05T09:00:00.000Z",
      endsAt: "2099-01-05T09:45:00.000Z",
      durationMinutes: 45,
      platform: "GOOGLE_MEET",
      candidate: { id: c.id, name: "Priya Sharma", currentStage: "APPLIED", job: { title: "Test Engineer" } },
      interviewers: [{ id: getBaseline().manager.id, name: "Test Manager" }],
      createdBy: { name: "Test Manager" },
    });
  });

  it("keeps the details it is given and ignores a repeated interviewer", async () => {
    const c = await newCandidate();
    const rita = await createUser({ name: "Rita" });
    const res = await schedule(c.id, {
      type: "PANEL",
      durationMinutes: 90,
      platform: "ZOOM",
      meetingLink: "https://zoom.us/j/123",
      location: "Room 4",
      notes: "Bring the take-home",
      interviewerIds: [rita.id, rita.id, getBaseline().manager.id],
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: "PANEL", durationMinutes: 90, platform: "ZOOM", meetingLink: "https://zoom.us/j/123", location: "Room 4", notes: "Bring the take-home" });
    expect(res.body.interviewers.map((i: { name: string }) => i.name)).toEqual(["Rita", "Test Manager"]);
  });

  it("validates the request", async () => {
    const c = await newCandidate();
    const bad = async (extra: Record<string, unknown>) => (await schedule(c.id, extra)).status;

    expect(await bad({ type: "CHAT" })).toBe(400);
    expect(await bad({ startsAt: "tomorrow" })).toBe(400);
    expect(await bad({ startsAt: "2099-01-05T09:00:00" })).toBe(400); // no time zone: ambiguous
    expect(await bad({ durationMinutes: 5 })).toBe(400);
    expect(await bad({ durationMinutes: 481 })).toBe(400);
    expect(await bad({ durationMinutes: 30.5 })).toBe(400);
    expect(await bad({ platform: "CARRIER_PIGEON" })).toBe(400);
    expect(await bad({ meetingLink: "not a url" })).toBe(400);
    expect(await bad({ interviewerIds: Array.from({ length: 9 }, (_, i) => `u${i}`) })).toBe(400);
    expect((await api.post("/api/interviews").send({ type: "HR", startsAt: iso(30) })).status).toBe(400);
  });

  it("refuses to schedule in the past, allowing a few minutes' slack", async () => {
    const c = await newCandidate();
    expect((await schedule(c.id, { startsAt: iso(-1) })).status).toBe(409);
    expect((await schedule(c.id, { startsAt: new Date(Date.now() - 60_000).toISOString() })).status).toBe(201);
  });

  it("needs a real candidate who is still in the running, and real, active interviewers", async () => {
    expect((await schedule("nope")).status).toBe(404);

    const hired = await seedCandidate({ name: "Hired", path: [{ stage: Stage.SCREENING, daysAgo: 4 }, { stage: Stage.INTERVIEW, daysAgo: 3 }, { stage: Stage.OFFER, daysAgo: 2 }, { stage: Stage.HIRED, daysAgo: 1 }] });
    const rejected = await seedCandidate({ name: "Rejected", path: [{ stage: Stage.REJECTED, daysAgo: 1 }] });
    expect((await schedule(hired.id)).body.error).toMatch(/already hired/i);
    expect((await schedule(rejected.id)).body.error).toMatch(/rejected/i);

    const c = await newCandidate();
    expect((await schedule(c.id, { interviewerIds: ["nobody"] })).status).toBe(404);
    const gone = await createUser({ status: UserStatus.DEACTIVATED });
    const res = await schedule(c.id, { interviewerIds: [gone.id] });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/deactivated/i);
  });

  it("lets any team member schedule, not just managers", async () => {
    const c = await newCandidate();
    const recruiter = await createUser({ role: UserRole.RECRUITER });
    const res = await schedule(c.id, {}, recruiter);
    expect(res.status).toBe(201);
    expect(res.body.createdBy.id).toBe(recruiter.id);
  });

  it("logs the event and tells the other interviewers — but not the person who scheduled it", async () => {
    const c = await newCandidate("Rahul Mehta");
    const rita = await createUser({ name: "Rita" });
    await schedule(c.id, { type: "HR", interviewerIds: [rita.id, getBaseline().manager.id] });

    const activity = await prisma.activity.findFirstOrThrow({ where: { type: "INTERVIEW_SCHEDULED" } });
    expect(activity).toMatchObject({ candidateId: c.id, actorId: getBaseline().manager.id, jobId: getBaseline().job.id });
    expect(activity.metadata).toMatchObject({ interviewType: "HR" });

    const forRita = await prisma.notification.findMany({ where: { userId: rita.id } });
    expect(forRita).toHaveLength(1);
    expect(forRita[0].title).toBe("HR interview with Rahul Mehta");
    expect(forRita[0].href).toMatch(/^\/calendar\?date=\d{4}-\d{2}-\d{2}&open=/);
    expect(await prisma.notification.count({ where: { userId: getBaseline().manager.id } })).toBe(0);
  });
});

describe("double-booking", () => {
  it("refuses a second interview for the same candidate at an overlapping time", async () => {
    const c = await newCandidate("Busy Candidate");
    const rita = await createUser({ name: "Rita" });
    await schedule(c.id, { startsAt: iso(30), durationMinutes: 60 });

    const res = await schedule(c.id, { startsAt: iso(30.5), durationMinutes: 30, interviewerIds: [rita.id] });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Busy Candidate already has an interview at that time.");
  });

  it("refuses to book an interviewer who is already in another interview", async () => {
    const a = await newCandidate("Alpha");
    const b = await newCandidate("Beta");
    await schedule(a.id, { startsAt: iso(30), durationMinutes: 60 });

    const res = await schedule(b.id, { startsAt: iso(30.25), durationMinutes: 30 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Test Manager is already booked for another interview at that time.");
  });

  it("allows back-to-back interviews and unrelated ones at the same time", async () => {
    const a = await newCandidate("Alpha");
    const b = await newCandidate("Beta");
    const rita = await createUser({ name: "Rita" });
    expect((await schedule(a.id, { startsAt: iso(30), durationMinutes: 60 })).status).toBe(201);

    // Starts the moment the first one ends.
    expect((await schedule(b.id, { startsAt: iso(31), durationMinutes: 60 })).status).toBe(201);
    // A different candidate and a different interviewer, at the very same time as the first.
    const c = await newCandidate("Gamma");
    expect((await schedule(c.id, { startsAt: iso(30), interviewerIds: [rita.id] })).status).toBe(201);
  });

  it("does not count cancelled interviews", async () => {
    const a = await newCandidate("Alpha");
    const first = await schedule(a.id, { startsAt: iso(30) });
    await api.patch(`/api/interviews/${first.body.id}`).send({ status: "CANCELLED" });

    expect((await schedule(a.id, { startsAt: iso(30) })).status).toBe(201);
  });

  it("lets only one of two simultaneous requests for the same slot through", async () => {
    const a = await newCandidate("Alpha");
    const b = await newCandidate("Beta");
    const [x, y] = await Promise.all([schedule(a.id, { startsAt: iso(40) }), schedule(b.id, { startsAt: iso(40) })]);

    expect([x.status, y.status].sort()).toEqual([201, 409]);
    expect(await prisma.interview.count()).toBe(1);
  });
});

describe("PATCH /api/interviews/:id", () => {
  async function scheduled(extra: Record<string, unknown> = {}) {
    const c = await newCandidate("Priya Sharma");
    const rita = await createUser({ name: "Rita" });
    const res = await schedule(c.id, { type: "TECHNICAL", startsAt: iso(30), durationMinutes: 60, interviewerIds: [rita.id, getBaseline().manager.id], ...extra });
    return { candidate: c, rita, interview: res.body as { id: string; startsAt: string; endsAt: string } };
  }

  it("reschedules, keeping the length, and logs and announces it", async () => {
    const { rita, interview, candidate } = await scheduled();
    await prisma.notification.deleteMany();

    const res = await api.patch(`/api/interviews/${interview.id}`).send({ startsAt: iso(50) });

    expect(res.status).toBe(200);
    expect(res.body.durationMinutes).toBe(60);
    expect(new Date(res.body.startsAt).getTime()).toBeGreaterThan(new Date(interview.startsAt).getTime());
    expect(await prisma.activity.count({ where: { type: "INTERVIEW_RESCHEDULED", candidateId: candidate.id } })).toBe(1);

    const [note] = await prisma.notification.findMany({ where: { userId: rita.id } });
    expect(note.title).toBe("Technical interview with Priya Sharma was rescheduled");
  });

  it("changes the length without moving the start", async () => {
    const { interview } = await scheduled();
    const res = await api.patch(`/api/interviews/${interview.id}`).send({ durationMinutes: 30 });
    expect(res.body.startsAt).toBe(interview.startsAt);
    expect(res.body.durationMinutes).toBe(30);
  });

  it("edits details without counting as a reschedule", async () => {
    const { interview, rita } = await scheduled();
    await prisma.notification.deleteMany();
    await prisma.activity.deleteMany();

    const res = await api.patch(`/api/interviews/${interview.id}`).send({ notes: "Focus on system design", platform: "ZOOM", meetingLink: "https://zoom.us/j/9" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ notes: "Focus on system design", platform: "ZOOM", startsAt: interview.startsAt, endsAt: interview.endsAt });
    expect(await prisma.activity.count()).toBe(0);
    expect(await prisma.notification.count({ where: { userId: rita.id } })).toBe(0);
  });

  it("does not treat an interview as clashing with itself", async () => {
    const { interview } = await scheduled();
    const res = await api.patch(`/api/interviews/${interview.id}`).send({ startsAt: interview.startsAt, durationMinutes: 60, notes: "same slot" });
    expect(res.status).toBe(200);
  });

  it("refuses to move into a clash or into the past", async () => {
    const { interview, candidate } = await scheduled();
    const other = await newCandidate("Other");
    await schedule(other.id, { startsAt: iso(80), interviewerIds: [getBaseline().manager.id] });

    expect((await api.patch(`/api/interviews/${interview.id}`).send({ startsAt: iso(80.25) })).status).toBe(409);
    expect((await api.patch(`/api/interviews/${interview.id}`).send({ startsAt: iso(-3) })).status).toBe(409);
    expect((await api.get(`/api/interviews/${interview.id}`)).body.candidate.id).toBe(candidate.id);
  });

  it("swaps interviewers, checking the new ones are free and at least one remains", async () => {
    const { interview, rita } = await scheduled();
    const sam = await createUser({ name: "Sam" });

    const swapped = await api.patch(`/api/interviews/${interview.id}`).send({ interviewerIds: [sam.id] });
    expect(swapped.body.interviewers.map((i: { name: string }) => i.name)).toEqual(["Sam"]);

    expect((await api.patch(`/api/interviews/${interview.id}`).send({ interviewerIds: [] })).status).toBe(400);

    // Rita is in another interview at the same time as this one.
    const other = await newCandidate("Other");
    await schedule(other.id, { startsAt: iso(30), interviewerIds: [rita.id] });
    expect((await api.patch(`/api/interviews/${interview.id}`).send({ interviewerIds: [rita.id] })).status).toBe(409);
  });

  it("marks an interview completed, logging it without notifying anyone", async () => {
    const { interview, rita, candidate } = await scheduled();
    await prisma.notification.deleteMany();

    const res = await api.patch(`/api/interviews/${interview.id}`).send({ status: "COMPLETED" });

    expect(res.body.status).toBe("COMPLETED");
    expect(res.body.startsAt).toBe(interview.startsAt);
    expect(await prisma.activity.count({ where: { type: "INTERVIEW_COMPLETED", candidateId: candidate.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: rita.id } })).toBe(0);
  });

  it("cancels an interview and tells the other interviewers", async () => {
    const { interview, rita, candidate } = await scheduled();
    await prisma.notification.deleteMany();

    const res = await api.patch(`/api/interviews/${interview.id}`).send({ status: "CANCELLED" });

    expect(res.body.status).toBe("CANCELLED");
    expect(await prisma.activity.count({ where: { type: "INTERVIEW_CANCELLED", candidateId: candidate.id } })).toBe(1);
    const [note] = await prisma.notification.findMany({ where: { userId: rita.id } });
    expect(note.title).toBe("Technical interview with Priya Sharma was cancelled");
  });

  it("freezes an interview once it is completed or cancelled", async () => {
    const { interview } = await scheduled();
    await api.patch(`/api/interviews/${interview.id}`).send({ status: "CANCELLED" });

    for (const body of [{ status: "COMPLETED" }, { status: "CANCELLED" }, { notes: "too late" }, { startsAt: iso(60) }]) {
      const res = await api.patch(`/api/interviews/${interview.id}`).send(body);
      expect(res.status, JSON.stringify(body)).toBe(409);
      expect(res.body.error).toMatch(/cancelled and can no longer be changed/i);
    }
  });

  it("does not accept SCHEDULED as a requested status, and 404s an unknown interview", async () => {
    const { interview } = await scheduled();
    expect((await api.patch(`/api/interviews/${interview.id}`).send({ status: "SCHEDULED" })).status).toBe(400);
    expect((await api.patch("/api/interviews/nope").send({ notes: "x" })).status).toBe(404);
  });
});

describe("reading interviews", () => {
  it("lists interviews in a date range, earliest first, and requires a sane range", async () => {
    const a = await newCandidate("Alpha");
    const b = await newCandidate("Beta");
    const c = await newCandidate("Gamma");
    const rita = await createUser();
    await schedule(a.id, { startsAt: iso(48) });
    await schedule(b.id, { startsAt: iso(26), interviewerIds: [rita.id] });
    await schedule(c.id, { startsAt: iso(24 * 20), interviewerIds: [rita.id] });

    const range = (fromH: number, toH: number) => `from=${encodeURIComponent(iso(fromH))}&to=${encodeURIComponent(iso(toH))}`;
    const week = await api.get(`/api/interviews?${range(0, 24 * 7)}`);
    expect(week.body.map((i: { candidate: { name: string } }) => i.candidate.name)).toEqual(["Beta", "Alpha"]);

    const all = await api.get(`/api/interviews?${range(0, 24 * 30)}`);
    expect(all.body).toHaveLength(3);

    expect((await api.get("/api/interviews")).status).toBe(400);
    expect((await api.get(`/api/interviews?${range(48, 24)}`)).status).toBe(400);
    expect((await api.get(`/api/interviews?${range(0, 24 * 101)}`)).status).toBe(400);
    expect((await api.get("/api/interviews?from=today&to=tomorrow")).status).toBe(400);
  });

  it("filters by status and by candidate", async () => {
    const a = await newCandidate("Alpha");
    const b = await newCandidate("Beta");
    const rita = await createUser();
    const done = await schedule(a.id, { startsAt: iso(30) });
    await api.patch(`/api/interviews/${done.body.id}`).send({ status: "COMPLETED" });
    await schedule(b.id, { startsAt: iso(30), interviewerIds: [rita.id] });
    const range = `from=${encodeURIComponent(iso(0))}&to=${encodeURIComponent(iso(24 * 3))}`;

    expect((await api.get(`/api/interviews?${range}&status=COMPLETED`)).body).toHaveLength(1);
    expect((await api.get(`/api/interviews?${range}&candidateId=${b.id}`)).body[0].candidate.name).toBe("Beta");
    expect((await api.get(`/api/interviews?${range}&status=MAYBE`)).status).toBe(400);
  });

  it("returns one interview, or 404", async () => {
    const a = await newCandidate();
    const made = await schedule(a.id);
    expect((await api.get(`/api/interviews/${made.body.id}`)).body.id).toBe(made.body.id);
    expect((await api.get("/api/interviews/nope")).status).toBe(404);
  });

  it("lists a candidate's interviews, newest first, including past ones", async () => {
    const a = await newCandidate();
    await insertInterview(a.id, at(-72), 60, { status: InterviewStatus.COMPLETED });
    await schedule(a.id, { startsAt: iso(30) });

    const res = await api.get(`/api/candidates/${a.id}/interviews`);
    expect(res.body.map((i: { status: string }) => i.status)).toEqual(["SCHEDULED", "COMPLETED"]);
    expect((await api.get("/api/candidates/nope/interviews")).status).toBe(404);
  });

  it("lists what is coming up: scheduled only, earliest first, including one under way", async () => {
    const a = await newCandidate("Past");
    const b = await newCandidate("Cancelled");
    const c = await newCandidate("Under way");
    const d = await newCandidate("Later");
    const e = await newCandidate("Soon");
    await insertInterview(a.id, at(-5), 60, { status: InterviewStatus.COMPLETED });
    await insertInterview(b.id, at(5), 60, { status: InterviewStatus.CANCELLED });
    await insertInterview(c.id, new Date(Date.now() - 10 * 60 * 1000), 30);
    await insertInterview(d.id, at(48), 30);
    await insertInterview(e.id, at(3), 30);

    const res = await api.get("/api/interviews/upcoming");
    expect(res.body.map((i: { candidate: { name: string } }) => i.candidate.name)).toEqual(["Under way", "Soon", "Later"]);

    const limited = await api.get("/api/interviews/upcoming?limit=2");
    expect(limited.body).toHaveLength(2);
    expect((await api.get("/api/interviews/upcoming?limit=0")).status).toBe(400);
  });

  it("counts today, this week, everything upcoming, and pending offers", async () => {
    const [a, b, c] = [await newCandidate("A"), await newCandidate("B"), await newCandidate("C")];
    await insertInterview(a.id, at(2), 30);
    await insertInterview(b.id, at(30), 30);
    await insertInterview(c.id, at(24 * 10), 30);
    await insertInterview((await newCandidate("D")).id, at(4), 30, { status: InterviewStatus.CANCELLED });
    await seedCandidate({ name: "Has an offer", path: [{ stage: Stage.SCREENING, daysAgo: 4 }, { stage: Stage.INTERVIEW, daysAgo: 3 }, { stage: Stage.OFFER, daysAgo: 1 }] });

    const q = new URLSearchParams({
      todayFrom: iso(0),
      todayTo: iso(24),
      weekFrom: iso(0),
      weekTo: iso(24 * 7),
    });
    const res = await api.get(`/api/interviews/stats?${q}`);
    expect(res.body).toEqual({ today: 1, week: 2, upcoming: 3, offers: 1 });
    expect((await api.get("/api/interviews/stats")).status).toBe(400);
  });
});
