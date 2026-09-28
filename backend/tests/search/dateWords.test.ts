import { describe, it, expect } from "vitest";
import { parseSinceDate } from "../../src/search/dateWords";

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
