import { describe, it, expect } from "vitest";
import { percentChange, windows } from "../../src/domain/periods";

describe("windows", () => {
  it("returns the last N days and the N days before them, back to back", () => {
    const now = new Date("2026-03-31T12:00:00.000Z");
    const { current, previous } = windows(now, 30);

    expect(current.to).toEqual(now);
    expect(current.from.toISOString()).toBe("2026-03-01T12:00:00.000Z");
    expect(previous.to).toEqual(current.from);
    expect(previous.from.toISOString()).toBe("2026-01-30T12:00:00.000Z");
  });
});

describe("percentChange", () => {
  it("rounds to a whole percent", () => {
    expect(percentChange(112, 100)).toBe(12);
    expect(percentChange(2, 3)).toBe(-33);
    expect(percentChange(1, 3)).toBe(-67);
  });

  it("is 0 when nothing changed and -100 when everything went away", () => {
    expect(percentChange(5, 5)).toBe(0);
    expect(percentChange(0, 4)).toBe(-100);
  });

  it("is null when there is nothing to compare against", () => {
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });
});
