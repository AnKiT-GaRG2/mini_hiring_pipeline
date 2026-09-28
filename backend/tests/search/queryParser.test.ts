import { describe, it, expect } from "vitest";
import { Stage } from "@prisma/client";
import { parseSearchQuery, ParsedFilters, SUPPORTED_FILTERS } from "../../src/search/queryParser";

// Wednesday 2026-09-23, local time — fixed so relative dates are deterministic.
const NOW = new Date(2026, 8, 23, 12, 0, 0);

function parseOk(query: string): ParsedFilters {
  const result = parseSearchQuery(query, NOW);
  if (!result.success) throw new Error(`Expected "${query}" to parse, got: ${result.message}`);
  return result.filters;
}

function parseFail(query: string) {
  const result = parseSearchQuery(query, NOW);
  if (result.success) {
    throw new Error(`Expected "${query}" to fail, got filters: ${JSON.stringify(result.filters)}`);
  }
  return result;
}

describe("name queries", () => {
  it.each([
    ["Find Priya Sharma", "Priya Sharma"],
    ["find priya sharma", "priya sharma"],
    ["Priya Sharma", "Priya Sharma"],
    ["Priya", "Priya"],
    ["sharam", "sharam"],
    ["search for Priya", "Priya"],
    ["show me Priya Sharma", "Priya Sharma"],
    ["Who is Priya Sharma?", "Priya Sharma"],
    ["  Find   Priya   Sharma  ", "Priya Sharma"],
  ])("%j -> name %j", (query, expected) => {
    expect(parseOk(query)).toEqual({ name: { query: expected } });
  });

  it("keeps an apostrophe inside a name", () => {
    expect(parseOk("Find O'Brien")).toEqual({ name: { query: "O'Brien" } });
  });
});

describe("current stage", () => {
  it("parses \"Who's in Interview right now?\"", () => {
    expect(parseOk("Who's in Interview right now?")).toEqual({ currentStage: Stage.INTERVIEW });
  });

  it("handles the curly apostrophe in Who’s", () => {
    expect(parseOk("Who’s in Interview right now?")).toEqual({ currentStage: Stage.INTERVIEW });
  });

  it.each([
    ["in Applied", Stage.APPLIED],
    ["in Screening", Stage.SCREENING],
    ["in Interview", Stage.INTERVIEW],
    ["in Offer", Stage.OFFER],
    ["in Hired", Stage.HIRED],
    ["in Rejected", Stage.REJECTED],
  ])("%j -> %s", (query, stage) => {
    expect(parseOk(query)).toEqual({ currentStage: stage });
  });

  it("is case-insensitive", () => {
    expect(parseOk("WHO IS IN INTERVIEW")).toEqual({ currentStage: Stage.INTERVIEW });
  });

  it("accepts \"the\" and a trailing \"stage\"", () => {
    expect(parseOk("who's in the Interview stage")).toEqual({ currentStage: Stage.INTERVIEW });
  });

  it("accepts stage synonyms", () => {
    expect(parseOk("in interviewing")).toEqual({ currentStage: Stage.INTERVIEW });
    expect(parseOk("in screen")).toEqual({ currentStage: Stage.SCREENING });
  });

  it("parses \"<Stage> candidates\"", () => {
    expect(parseOk("Offer candidates")).toEqual({ currentStage: Stage.OFFER });
    expect(parseOk("show me Screening candidates")).toEqual({ currentStage: Stage.SCREENING });
  });

  it("parses hiring-outcome verbs", () => {
    expect(parseOk("who got hired")).toEqual({ currentStage: Stage.HIRED });
    expect(parseOk("who was rejected")).toEqual({ currentStage: Stage.REJECTED });
  });

  it("treats a bare stage word as that stage", () => {
    expect(parseOk("hired")).toEqual({ currentStage: Stage.HIRED });
    expect(parseOk("Interview")).toEqual({ currentStage: Stage.INTERVIEW });
    expect(parseOk("rejected")).toEqual({ currentStage: Stage.REJECTED });
  });

  it("does not misread an unknown \"in <word>\" as a stage — it falls through to name", () => {
    expect(parseOk("who's in Bananas right now")).toEqual({ name: { query: "Bananas" } });
  });
});

describe("time in current stage", () => {
  it("parses the canonical example", () => {
    expect(parseOk("Who has been stuck in Screening for more than a week?")).toEqual({
      currentStage: Stage.SCREENING,
      currentStageDuration: { operator: ">", durationDays: 7 },
    });
  });

  it.each([
    ["in Screening for more than 7 days", ">", 7],
    ["in Screening for more than a week", ">", 7],
    ["in Screening for more than 2 weeks", ">", 14],
    ["in Screening for over 10 days", ">", 10],
    ["in Interview for at least 2 weeks", ">=", 14],
    ["in Offer for less than 3 days", "<", 3],
    ["in Offer for under 2 weeks", "<", 14],
    ["in Offer for at most 5 days", "<=", 5],
    ["in Offer for no more than 5 days", "<=", 5],
    ["in Offer for exactly 4 days", "=", 4],
    ["in Screening for 1 week", ">=", 7],
    ["in Screening for a day", ">=", 1],
  ])("%j", (query, operator, durationDays) => {
    expect(parseOk(query).currentStageDuration).toEqual({ operator, durationDays });
  });

  it("does not produce a duration filter for a non-day/week unit", () => {
    expect(parseOk("in Screening for an hour").currentStageDuration).toBeUndefined();
  });

  it("also sets currentStage from the duration phrase", () => {
    expect(parseOk("in Offer for at most 5 days").currentStage).toBe(Stage.OFFER);
  });

  it("defaults a bare \"for N days\" to >= (at least N days)", () => {
    expect(parseOk("in Screening for 7 days").currentStageDuration).toEqual({
      operator: ">=",
      durationDays: 7,
    });
  });
});

describe("stage movement and transition dates", () => {
  it("parses \"Who moved to Interview since Monday?\"", () => {
    expect(parseOk("Who moved to Interview since Monday?")).toEqual({
      movedToStage: { stage: Stage.INTERVIEW, since: new Date(2026, 8, 21) },
    });
  });

  it("parses \"people who moved to Interview since Monday\"", () => {
    expect(parseOk("people who moved to Interview since Monday")).toEqual({
      movedToStage: { stage: Stage.INTERVIEW, since: new Date(2026, 8, 21) },
    });
  });

  it("allows moved-to with no date", () => {
    expect(parseOk("who moved to Offer")).toEqual({
      movedToStage: { stage: Stage.OFFER, since: undefined },
    });
  });

  it("accepts \"the\" and a trailing \"stage\"", () => {
    expect(parseOk("moved to the Offer stage since Friday").movedToStage?.stage).toBe(Stage.OFFER);
  });

  it.each([
    ["since today", new Date(2026, 8, 23)],
    ["since yesterday", new Date(2026, 8, 22)],
    ["since Monday", new Date(2026, 8, 21)],
    ["since Wednesday", new Date(2026, 8, 23)], // today counts as "most recent Wednesday"
    ["since Thursday", new Date(2026, 8, 17)], // 6 days back, not tomorrow
    ["since Sunday", new Date(2026, 8, 20)],
    ["since 3 days ago", new Date(2026, 8, 20)],
    ["since 1 day ago", new Date(2026, 8, 22)],
    ["since 2026-09-01", new Date(2026, 8, 1)],
  ])("resolves %j", (suffix, expected) => {
    expect(parseOk(`moved to Interview ${suffix}`).movedToStage?.since).toEqual(expected);
  });

  it("parses \"reached <Stage>\" as having entered that stage", () => {
    expect(parseOk("who reached Interview")).toEqual({
      movedToStage: { stage: Stage.INTERVIEW },
    });
  });

  it("does not misread \"reached out\" as a stage", () => {
    expect(parseOk("candidates who reached out")).toEqual({ name: { query: "out" } });
  });
});

describe("hiring outcome: reached a stage but not hired", () => {
  it.each([
    "Who reached the Offer stage but didn't get hired?",
    "Who reached the Offer stage but didn’t get hired?",
    "Who reached the Offer stage but did not get hired?",
    "reached Offer but were not hired",
    "Offer candidates who were not hired",
    "Offer candidates who weren't hired",
    "offer candidates that were not hired",
  ])("%j -> reachedStageNotHired OFFER", (query) => {
    expect(parseOk(query)).toEqual({ reachedStageNotHired: Stage.OFFER });
  });

  it("works for other stages", () => {
    expect(parseOk("Interview candidates who were not hired")).toEqual({
      reachedStageNotHired: Stage.INTERVIEW,
    });
    expect(parseOk("who reached Screening but did not get hired")).toEqual({
      reachedStageNotHired: Stage.SCREENING,
    });
  });

  it("does not treat \"<Stage> candidates\" alone as a not-hired query", () => {
    expect(parseOk("Offer candidates")).toEqual({ currentStage: Stage.OFFER });
  });
});

describe("excluding stages", () => {
  it.each([
    "Everyone except rejected candidates",
    "everyone except rejected",
    "excluding rejected candidates",
    "excluding rejected",
    "without rejected candidates",
    "except Rejected",
  ])("%j -> excludeStages [REJECTED]", (query) => {
    expect(parseOk(query)).toEqual({ excludeStages: [Stage.REJECTED] });
  });

  it("can exclude other stages", () => {
    expect(parseOk("everyone except hired candidates")).toEqual({ excludeStages: [Stage.HIRED] });
  });
});

describe("combined conditions", () => {
  it("name + stage", () => {
    expect(parseOk("Priya in Screening")).toEqual({
      name: { query: "Priya" },
      currentStage: Stage.SCREENING,
    });
  });

  it("name + stage + duration", () => {
    expect(parseOk("Priya in Screening for more than 7 days")).toEqual({
      name: { query: "Priya" },
      currentStage: Stage.SCREENING,
      currentStageDuration: { operator: ">", durationDays: 7 },
    });
  });

  it("name + exclusion", () => {
    expect(parseOk("Priya except rejected candidates")).toEqual({
      name: { query: "Priya" },
      excludeStages: [Stage.REJECTED],
    });
  });

  it("fuzzy name + stage", () => {
    expect(parseOk("sharam in Interview")).toEqual({
      name: { query: "sharam" },
      currentStage: Stage.INTERVIEW,
    });
  });

  it("name + reached-but-not-hired", () => {
    expect(parseOk("Priya who reached Offer but did not get hired")).toEqual({
      name: { query: "Priya" },
      reachedStageNotHired: Stage.OFFER,
    });
  });

  it("stage + exclusion", () => {
    expect(parseOk("everyone in Interview except rejected candidates")).toEqual({
      currentStage: Stage.INTERVIEW,
      excludeStages: [Stage.REJECTED],
    });
  });
});

describe("select-all queries", () => {
  it.each(["everyone", "Everybody", "all", "all candidates", "list all candidates", "Show all candidates"])(
    "%j -> no filters",
    (query) => {
      expect(parseOk(query)).toEqual({});
    },
  );
});

describe("failures", () => {
  it.each([[""], ["   "], ["?"], ["who is the"], ["please"]])("%j fails as not understood", (query) => {
    const result = parseFail(query);
    expect(result.message).toContain("couldn't understand this search");
    expect(result.supportedFilters).toEqual(SUPPORTED_FILTERS);
    expect(result.supportedFilters.length).toBeGreaterThan(0);
  });

  it("returns the original query text on failure", () => {
    expect(parseFail("who is the").query).toBe("who is the");
  });

  it.each([
    ["moved to Bananas", "Bananas"],
    ["everyone except Bananas candidates", "Bananas"],
    ["who reached the Bananas stage but did not get hired", "Bananas"],
    ["Bananas candidates who were not hired", "Bananas"],
    ["in Bananas for more than a week", "Bananas"],
  ])("explains an unknown stage in %j", (query, word) => {
    const result = parseFail(query);
    expect(result.message).toContain(`"${word}"`);
    expect(result.message).toContain("not a valid stage");
    expect(result.message).toContain("Applied, Screening, Interview, Offer, Hired, Rejected");
  });

  it("explains an unparseable date and lists the supported formats", () => {
    const result = parseFail("moved to Interview since next tuesday");
    expect(result.message).toContain("next tuesday");
    expect(result.message).toContain("couldn't parse it");
    expect(result.message).toMatch(/Monday.*today.*yesterday.*YYYY-MM-DD/);
  });

  it("rejects an impossible calendar date", () => {
    expect(parseFail("moved to Interview since 2026-02-31").message).toContain("couldn't parse it");
  });
});

describe("determinism", () => {
  it("returns identical results for identical input and clock", () => {
    const q = "Priya in Screening for more than 7 days";
    expect(parseSearchQuery(q, NOW)).toEqual(parseSearchQuery(q, NOW));
  });

  it("does not depend on whitespace or trailing punctuation", () => {
    const a = parseOk("Who's in Interview right now?");
    const b = parseOk("  who's   in   interview   right   now  ");
    const c = parseOk("Who's in Interview right now!!!");
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("echoes the original query untouched on success", () => {
    const q = "  Who's in Interview right now?  ";
    const result = parseSearchQuery(q, NOW);
    expect(result.query).toBe(q);
  });
});
