import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { Stage } from "@prisma/client";
import { app } from "../../src/app";
import { prisma } from "../../src/db/prisma";
import { resetDatabase } from "../helpers/db";
import { seedCandidate } from "../helpers/candidates";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function search(q: string) {
  return request(app).get("/api/search").query({ q });
}

type Result = { name: string; currentStage: Stage; score: number | null };
const names = (body: { results: Result[] }) => body.results.map((r) => r.name);

/** A small pipeline whose timestamps are all relative to "now". */
async function seedPipeline() {
  await seedCandidate({ name: "Priya Sharma", appliedDaysAgo: 2 });
  await seedCandidate({
    name: "Priya Nair",
    appliedDaysAgo: 12,
    path: [{ stage: Stage.SCREENING, daysAgo: 10 }],
  });
  await seedCandidate({
    name: "Rahul Mehta",
    appliedDaysAgo: 4,
    path: [{ stage: Stage.SCREENING, daysAgo: 2 }],
  });
  await seedCandidate({
    name: "Vikram Nair",
    appliedDaysAgo: 20,
    path: [
      { stage: Stage.SCREENING, daysAgo: 6 },
      { stage: Stage.INTERVIEW, daysAgo: 1 },
    ],
  });
  await seedCandidate({
    name: "Sneha Reddy",
    appliedDaysAgo: 30,
    path: [
      { stage: Stage.SCREENING, daysAgo: 25 },
      { stage: Stage.INTERVIEW, daysAgo: 10 },
    ],
  });
  await seedCandidate({
    name: "Arjun Kapoor",
    appliedDaysAgo: 30,
    path: [
      { stage: Stage.SCREENING, daysAgo: 25 },
      { stage: Stage.INTERVIEW, daysAgo: 15 },
      { stage: Stage.OFFER, daysAgo: 3 },
    ],
  });
  await seedCandidate({
    name: "Ritu Singh",
    appliedDaysAgo: 40,
    path: [
      { stage: Stage.SCREENING, daysAgo: 35 },
      { stage: Stage.INTERVIEW, daysAgo: 25 },
      { stage: Stage.OFFER, daysAgo: 10 },
      { stage: Stage.REJECTED, daysAgo: 8 },
    ],
  });
  await seedCandidate({
    name: "Karan Malhotra",
    appliedDaysAgo: 45,
    path: [
      { stage: Stage.SCREENING, daysAgo: 40 },
      { stage: Stage.INTERVIEW, daysAgo: 30 },
      { stage: Stage.OFFER, daysAgo: 10 },
      { stage: Stage.HIRED, daysAgo: 2 },
    ],
  });
  await seedCandidate({
    name: "Aditya Verma",
    appliedDaysAgo: 12,
    path: [{ stage: Stage.REJECTED, daysAgo: 9 }],
  });
}

describe("GET /api/search — request handling", () => {
  it("returns 400 when q is missing", async () => {
    const res = await request(app).get("/api/search");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("returns 400 when q is blank", async () => {
    expect((await search("")).status).toBe(400);
    expect((await search("   ")).status).toBe(400);
  });

  it("only exposes GET", async () => {
    expect((await request(app).post("/api/search").send({ q: "x" })).status).toBe(404);
  });

  it("returns the documented shape on success", async () => {
    await seedPipeline();
    const res = await search("Find Priya Sharma");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      query: "Find Priya Sharma",
      parsedQuery: { name: { query: "Priya Sharma" } },
    });
    expect(res.body.results[0]).toEqual(
      expect.objectContaining({
        name: "Priya Sharma",
        currentStage: "APPLIED",
        currentStageSince: expect.any(String),
        daysInCurrentStage: expect.any(Number),
        score: 1,
      }),
    );
    expect(res.body).not.toHaveProperty("message");
  });
});

describe("GET /api/search — queries it cannot understand", () => {
  it("explains a query with no usable content and lists supported filters", async () => {
    const res = await search("who is the");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: false,
      message: "I couldn't understand this search.",
      results: [],
    });
    expect(res.body.supportedFilters).toEqual(
      expect.arrayContaining([
        expect.stringContaining("candidate name"),
        expect.stringContaining("current stage"),
        expect.stringContaining("time spent in current stage"),
        expect.stringContaining("stage movement"),
        expect.stringContaining("hiring outcome"),
      ]),
    );
  });

  it("explains an unknown stage instead of returning an empty list", async () => {
    const res = await search("moved to Bananas");
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('"Bananas"');
    expect(res.body.message).toContain("not a valid stage");
  });

  it("explains an unparseable date", async () => {
    const res = await search("moved to Interview since next tuesday");
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("couldn't parse it");
  });

  it("explains how it interpreted a query that matched nobody", async () => {
    await seedPipeline();
    const res = await search("who's in Bananas right now");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.results).toEqual([]);
    expect(res.body.message).toContain("No candidates matched");
    expect(res.body.message).toContain('name similar to "Bananas"');
  });
});

describe("GET /api/search — name matching and ranking", () => {
  it("finds a candidate by full name with a perfect score", async () => {
    await seedPipeline();
    const res = await search("Find Priya Sharma");
    expect(res.body.results[0]).toMatchObject({ name: "Priya Sharma", score: 1 });
  });

  it("is case-insensitive", async () => {
    await seedPipeline();
    const res = await search("PRIYA SHARMA");
    expect(res.body.results[0].name).toBe("Priya Sharma");
  });

  it("finds a candidate from a misspelled surname (\"sharam\")", async () => {
    await seedPipeline();
    const res = await search("sharam");

    expect(res.body.success).toBe(true);
    expect(names(res.body)).toEqual(["Priya Sharma"]);
    expect(res.body.results[0].score).toBeGreaterThan(0.45);
  });

  it("finds a candidate from a last name alone", async () => {
    await seedPipeline();
    expect(names((await search("Sharma")).body)).toEqual(["Priya Sharma"]);
  });

  it("does not return unrelated candidates for a fuzzy query", async () => {
    await seedPipeline();
    const res = await search("xyzabc");
    expect(res.body.results).toEqual([]);
  });

  it("ranks exact > prefix > strong fuzzy > weak fuzzy, and drops noise", async () => {
    await seedCandidate({ name: "Nita Rao" }); // noise, similarity 0.17 — excluded
    await seedCandidate({ name: "Amit Menta" }); // weak fuzzy, 0.33
    await seedCandidate({ name: "Rahul Mehra" }); // strong fuzzy, 0.5
    await seedCandidate({ name: "Rahul Mehta" }); // strong fuzzy, 1.0
    await seedCandidate({ name: "Mehtani Rao" }); // prefix (raw similarity 0.83)
    await seedCandidate({ name: "Mehta" }); // exact

    const res = await search("mehta");

    expect(names(res.body)).toEqual([
      "Mehta",
      "Mehtani Rao",
      "Rahul Mehta",
      "Rahul Mehra",
      "Amit Menta",
    ]);
  });

  it("puts a prefix match ahead of a fuzzy match with a higher raw score", async () => {
    await seedCandidate({ name: "Mehtani Rao" }); // prefix, raw 0.83
    await seedCandidate({ name: "Rahul Mehta" }); // fuzzy, raw 1.0

    const res = await search("mehta");
    const [first, second] = res.body.results;

    expect(first.name).toBe("Mehtani Rao");
    expect(second.name).toBe("Rahul Mehta");
    expect(second.score).toBeGreaterThan(first.score);
  });

  it("breaks ties within a tier by name", async () => {
    await seedPipeline();
    const res = await search("priya");
    expect(names(res.body)).toEqual(["Priya Nair", "Priya Sharma"]);
  });
});

describe("GET /api/search — why a name matched (matchType)", () => {
  const matchTypes = (body: { results: { name: string; matchType: string | null }[] }) =>
    Object.fromEntries(body.results.map((r) => [r.name, r.matchType]));

  it("labels exact, prefix, whole-word and fuzzy matches", async () => {
    await seedCandidate({ name: "Mehta" }); // exact
    await seedCandidate({ name: "Mehtani Rao" }); // prefix
    await seedCandidate({ name: "Rahul Mehta" }); // whole word inside the name
    await seedCandidate({ name: "Rahul Mehra" }); // close, but not the same
    await seedCandidate({ name: "Amit Menta" }); // weaker, but still a real fuzzy match

    const res = await search("mehta");

    expect(matchTypes(res.body)).toEqual({
      Mehta: "exact",
      "Mehtani Rao": "prefix",
      "Rahul Mehta": "word",
      "Rahul Mehra": "fuzzy",
      "Amit Menta": "fuzzy",
    });
  });

  it("calls a misspelled surname a fuzzy match", async () => {
    await seedPipeline();
    const res = await search("sharam");
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0]).toMatchObject({ name: "Priya Sharma", matchType: "fuzzy" });
  });

  it("calls a full-name query exact and a first-name query prefix", async () => {
    await seedPipeline();
    expect((await search("Priya Sharma")).body.results[0].matchType).toBe("exact");
    expect(matchTypes((await search("priya")).body)).toEqual({ "Priya Nair": "prefix", "Priya Sharma": "prefix" });
  });

  it("has no matchType when the query has no name part", async () => {
    await seedPipeline();
    const res = await search("who's in Interview right now?");
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results.every((r: { matchType: unknown; score: unknown }) => r.matchType === null && r.score === null)).toBe(true);
  });
});

describe("GET /api/search — current stage", () => {
  beforeEach(seedPipeline);

  it("\"Who's in Interview right now?\"", async () => {
    const res = await search("Who's in Interview right now?");
    expect(res.body.parsedQuery).toEqual({ currentStage: "INTERVIEW" });
    expect(names(res.body)).toEqual(["Sneha Reddy", "Vikram Nair"]);
    expect(res.body.results.every((r: Result) => r.score === null)).toBe(true);
  });

  it("a bare stage word", async () => {
    expect(names((await search("hired")).body)).toEqual(["Karan Malhotra"]);
  });

  it("\"Offer candidates\"", async () => {
    expect(names((await search("Offer candidates")).body)).toEqual(["Arjun Kapoor"]);
  });
});

describe("GET /api/search — time in current stage", () => {
  beforeEach(seedPipeline);

  it("\"stuck in Screening for more than a week\"", async () => {
    const res = await search("Who has been stuck in Screening for more than a week?");
    expect(res.body.parsedQuery).toEqual({
      currentStage: "SCREENING",
      currentStageDuration: { operator: ">", durationDays: 7 },
    });
    expect(names(res.body)).toEqual(["Priya Nair"]);
  });

  it("\"for less than 5 days\"", async () => {
    expect(names((await search("in Screening for less than 5 days")).body)).toEqual(["Rahul Mehta"]);
  });

  it("\"for at least 1 day\" includes everyone in the stage", async () => {
    expect(names((await search("in Screening for at least 1 day")).body)).toEqual([
      "Priya Nair",
      "Rahul Mehta",
    ]);
  });

  it("respects weeks", async () => {
    expect(names((await search("in Interview for more than 1 week")).body)).toEqual(["Sneha Reddy"]);
    expect((await search("in Interview for more than 2 weeks")).body.results).toEqual([]);
  });
});

describe("GET /api/search — stage movement and transition date", () => {
  beforeEach(seedPipeline);

  it("\"moved to Interview since 3 days ago\" excludes older moves", async () => {
    const res = await search("Who moved to Interview since 3 days ago?");
    expect(res.body.parsedQuery.movedToStage).toMatchObject({ stage: "INTERVIEW" });
    expect(res.body.parsedQuery.movedToStage.since).toEqual(expect.any(String));
    expect(names(res.body)).toEqual(["Vikram Nair"]);
  });

  it("\"since yesterday\"", async () => {
    expect(names((await search("people who moved to Interview since yesterday")).body)).toEqual([
      "Vikram Nair",
    ]);
  });

  it("\"since 30 days ago\" widens the window", async () => {
    expect(names((await search("moved to Interview since 30 days ago")).body).sort()).toEqual([
      "Arjun Kapoor",
      "Karan Malhotra",
      "Ritu Singh",
      "Sneha Reddy",
      "Vikram Nair",
    ]);
  });

  it("moved-to with no date matches anyone who ever entered the stage", async () => {
    expect(names((await search("who moved to Offer")).body).sort()).toEqual([
      "Arjun Kapoor",
      "Karan Malhotra",
      "Ritu Singh",
    ]);
  });

  it("\"reached Interview\" includes people who have since moved on", async () => {
    const res = await search("who reached Interview");
    expect(names(res.body).sort()).toEqual([
      "Arjun Kapoor",
      "Karan Malhotra",
      "Ritu Singh",
      "Sneha Reddy",
      "Vikram Nair",
    ]);
  });

  it("supports weekday names (resolved against the real clock)", async () => {
    const res = await search("who moved to Interview since Monday");
    expect(res.body.success).toBe(true);
    const since = new Date(res.body.parsedQuery.movedToStage.since);
    expect(since.getDay()).toBe(1);
    expect(since.getHours()).toBe(0);
    expect(since.getTime()).toBeLessThanOrEqual(Date.now());
    expect(Date.now() - since.getTime()).toBeLessThan(7 * 24 * 60 * 60 * 1000);
  });
});

describe("GET /api/search — hiring outcome", () => {
  beforeEach(seedPipeline);

  const expected = ["Arjun Kapoor", "Ritu Singh"];

  it("\"reached the Offer stage but didn't get hired\"", async () => {
    const res = await search("Who reached the Offer stage but didn't get hired?");
    expect(res.body.parsedQuery).toEqual({ reachedStageNotHired: "OFFER" });
    expect(names(res.body).sort()).toEqual(expected);
  });

  it("\"Offer candidates who were not hired\"", async () => {
    expect(names((await search("Offer candidates who were not hired")).body).sort()).toEqual(expected);
  });

  it("includes candidates rejected after the stage and those still sitting in it, never the hired", async () => {
    const res = await search("reached Offer but were not hired");
    const stages = Object.fromEntries(res.body.results.map((r: Result) => [r.name, r.currentStage]));
    expect(stages).toEqual({ "Arjun Kapoor": "OFFER", "Ritu Singh": "REJECTED" });
    expect(stages).not.toHaveProperty("Karan Malhotra");
  });

  it("works for earlier stages", async () => {
    expect(names((await search("Interview candidates who were not hired")).body).sort()).toEqual([
      "Arjun Kapoor",
      "Ritu Singh",
      "Sneha Reddy",
      "Vikram Nair",
    ]);
  });
});

describe("GET /api/search — exclusion", () => {
  beforeEach(seedPipeline);

  it("\"Everyone except rejected candidates\"", async () => {
    const res = await search("Everyone except rejected candidates");
    expect(res.body.parsedQuery).toEqual({ excludeStages: ["REJECTED"] });
    expect(names(res.body)).not.toContain("Ritu Singh");
    expect(names(res.body)).not.toContain("Aditya Verma");
    expect(res.body.results).toHaveLength(7);
  });

  it("returns results in pipeline order, then by name", async () => {
    const res = await search("everyone except rejected candidates");
    expect(res.body.results.map((r: Result) => r.currentStage)).toEqual([
      "APPLIED",
      "SCREENING",
      "SCREENING",
      "INTERVIEW",
      "INTERVIEW",
      "OFFER",
      "HIRED",
    ]);
    expect(names(res.body).slice(1, 3)).toEqual(["Priya Nair", "Rahul Mehta"]);
  });

  it("\"everyone\" returns all candidates", async () => {
    expect((await search("everyone")).body.results).toHaveLength(9);
  });
});

describe("GET /api/search — combined conditions", () => {
  beforeEach(seedPipeline);

  it("\"Priya in Screening\" only matches the Priya who is in Screening", async () => {
    const res = await search("Priya in Screening");
    expect(res.body.parsedQuery).toEqual({
      name: { query: "Priya" },
      currentStage: "SCREENING",
    });
    expect(names(res.body)).toEqual(["Priya Nair"]);
  });

  it("\"Priya in Screening for more than 7 days\"", async () => {
    expect(names((await search("Priya in Screening for more than 7 days")).body)).toEqual(["Priya Nair"]);
  });

  it("returns nothing (with an explanation) when the conditions do not all hold", async () => {
    const res = await search("Priya in Screening for more than 30 days");
    expect(res.body.results).toEqual([]);
    expect(res.body.message).toContain('name similar to "Priya"');
    expect(res.body.message).toContain("currently in Screening");
    expect(res.body.message).toContain("more than 30 days");
  });

  it("combines a misspelled name with a stage", async () => {
    expect(names((await search("sharam in Applied")).body)).toEqual(["Priya Sharma"]);
    expect((await search("sharam in Interview")).body.results).toEqual([]);
  });

  it("combines a name with an exclusion", async () => {
    expect(names((await search("Priya except rejected candidates")).body)).toEqual([
      "Priya Nair",
      "Priya Sharma",
    ]);
  });

  it("combines a name with the hiring-outcome filter", async () => {
    expect(names((await search("Ritu who reached Offer but did not get hired")).body)).toEqual(["Ritu Singh"]);
    expect((await search("Priya who reached Offer but did not get hired")).body.results).toEqual([]);
  });

  it("combines stage movement with a stage exclusion", async () => {
    expect(names((await search("people who moved to Offer except hired candidates")).body).sort()).toEqual([
      "Arjun Kapoor",
      "Ritu Singh",
    ]);
  });
});
