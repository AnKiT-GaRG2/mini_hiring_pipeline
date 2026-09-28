import { describe, it, expect } from "vitest";
import { parseDayPhrase, parseSinceDate } from "../../src/search/dateWords";

// Wednesday 2026-09-23 12:00 local.
const NOW = new Date(2026, 8, 23, 12, 0, 0);

describe("parseSinceDate", () => {
  it.each([
    ["today", new Date(2026, 8, 23)],
    ["yesterday", new Date(2026, 8, 22)],
    ["monday", new Date(2026, 8, 21)],
    ["Monday", new Date(2026, 8, 21)],
    ["MONDAY", new Date(2026, 8, 21)],
    ["tuesday", new Date(2026, 8, 22)],
    ["wednesday", new Date(2026, 8, 23)],
    ["thursday", new Date(2026, 8, 17)],
    ["friday", new Date(2026, 8, 18)],
    ["saturday", new Date(2026, 8, 19)],
    ["sunday", new Date(2026, 8, 20)],
    ["1 day ago", new Date(2026, 8, 22)],
    ["3 days ago", new Date(2026, 8, 20)],
    ["10 days ago", new Date(2026, 8, 13)],
    ["2026-09-01", new Date(2026, 8, 1)],
    ["  monday  ", new Date(2026, 8, 21)],
  ])("%j", (phrase, expected) => {
    expect(parseSinceDate(phrase, NOW)).toEqual(expected);
  });

  it("returns midnight, not the time of day", () => {
    const result = parseSinceDate("today", NOW)!;
    expect([result.getHours(), result.getMinutes(), result.getSeconds()]).toEqual([0, 0, 0]);
  });

  it("crosses a month boundary correctly", () => {
    expect(parseSinceDate("5 days ago", new Date(2026, 9, 2, 9, 0))).toEqual(new Date(2026, 8, 27));
  });

  it.each(["", "next tuesday", "last week", "2026-13-01", "2026-02-31", "soon", "0 days"])(
    "returns undefined for %j",
    (phrase) => {
      expect(parseSinceDate(phrase, NOW)).toBeUndefined();
    },
  );
});

describe("parseDayPhrase", () => {
  const day = (m: number, d: number) => new Date(2026, m, d);
  const span = (m: number, d: number, days = 1) => ({ from: day(m, d), to: new Date(2026, m, d + days) });

  it.each<[string, ReturnType<typeof span>]>([
    ["today", span(8, 23)],
    ["tomorrow", span(8, 24)],
    ["yesterday", span(8, 22)],
    ["  Today  ", span(8, 23)],
    ["TOMORROW", span(8, 24)],
  ])("%j", (phrase, expected) => {
    expect(parseDayPhrase(phrase, NOW)).toEqual(expected);
  });

  it("resolves a bare weekday to the nearest occurrence, counting today", () => {
    expect(parseDayPhrase("wednesday", NOW)).toEqual(span(8, 23)); // NOW is a Wednesday
    expect(parseDayPhrase("monday", NOW)).toEqual(span(8, 28)); // the coming Monday, not the 21st
    expect(parseDayPhrase("friday", NOW)).toEqual(span(8, 25));
  });

  it("'next <weekday>' skips today even when today is that weekday", () => {
    expect(parseDayPhrase("next wednesday", NOW)).toEqual(span(8, 30));
    expect(parseDayPhrase("next monday", NOW)).toEqual(span(8, 28));
    expect(parseDayPhrase("Next Friday", NOW)).toEqual(span(8, 25));
  });

  it("'last <weekday>' skips today even when today is that weekday", () => {
    expect(parseDayPhrase("last wednesday", NOW)).toEqual(span(8, 16));
    expect(parseDayPhrase("last monday", NOW)).toEqual(span(8, 21));
  });

  it("'this week' and 'next week' span Sunday through the following Sunday", () => {
    expect(parseDayPhrase("this week", NOW)).toEqual(span(8, 20, 7)); // Sun 20 – Sun 27
    expect(parseDayPhrase("next week", NOW)).toEqual(span(8, 27, 7)); // Sun 27 – Sun 4 Oct
  });

  it("parses an ISO date", () => {
    expect(parseDayPhrase("2026-10-05", NOW)).toEqual(span(9, 5));
  });

  it("parses month-then-day and day-then-month, with or without a year", () => {
    expect(parseDayPhrase("sep 30", NOW)).toEqual(span(8, 30));
    expect(parseDayPhrase("September 30", NOW)).toEqual(span(8, 30));
    expect(parseDayPhrase("30 sep", NOW)).toEqual(span(8, 30));
    expect(parseDayPhrase("30th September", NOW)).toEqual(span(8, 30));
    expect(parseDayPhrase("Oct 1, 2026", NOW)).toEqual(span(9, 1));
    expect(parseDayPhrase("1 Oct 2027", NOW)).toEqual({ from: new Date(2027, 9, 1), to: new Date(2027, 9, 2) });
  });

  it.each(["", "   ", "soon", "next", "someday", "2026-13-01", "2026-02-31", "feb 31", "next someday"])(
    "returns undefined for %j",
    (phrase) => {
      expect(parseDayPhrase(phrase, NOW)).toBeUndefined();
    },
  );
});

describe("parseDayPhrase — predicts from a partial word", () => {
  const day = (m: number, d: number) => new Date(2026, m, d);
  const span = (m: number, d: number) => ({ from: day(m, d), to: new Date(2026, m, d + 1) });

  it.each<[string, ReturnType<typeof span>]>([
    ["tod", span(8, 23)],
    ["today", span(8, 23)],
    ["tom", span(8, 24)],
    ["tomo", span(8, 24)],
    ["yes", span(8, 22)],
    ["mon", span(8, 28)],
    ["wed", span(8, 23)],
    ["sat", span(8, 26)],
  ])("%j", (phrase, expected) => {
    expect(parseDayPhrase(phrase, NOW)).toEqual(expected);
  });

  it("does not predict below 3 letters", () => {
    expect(parseDayPhrase("to", NOW)).toBeUndefined();
    expect(parseDayPhrase("mo", NOW)).toBeUndefined();
  });

  it("does not predict a prefix shared by more than one word", () => {
    // "tod" and "tom" both start with "t", "to" — but resolve once 3 letters tell them apart.
    expect(parseDayPhrase("t", NOW)).toBeUndefined();
    expect(parseDayPhrase("to", NOW)).toBeUndefined();
  });
});
