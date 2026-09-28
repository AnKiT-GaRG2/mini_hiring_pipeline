import { describe, it, expect } from "vitest";
import { Stage } from "@prisma/client";
import { describeFilters } from "../../src/search/describeFilters";

describe("describeFilters", () => {
  it("describes a name filter", () => {
    expect(describeFilters({ name: { query: "sharam" } })).toBe('name similar to "sharam"');
  });

  it("describes a stage", () => {
    expect(describeFilters({ currentStage: Stage.INTERVIEW })).toBe("currently in Interview");
  });

  it("describes duration operators in words, pluralising days", () => {
    expect(
      describeFilters({ currentStageDuration: { operator: ">", durationDays: 7 } }),
    ).toBe("in current stage more than 7 days");
    expect(
      describeFilters({ currentStageDuration: { operator: "<=", durationDays: 1 } }),
    ).toBe("in current stage at most 1 day");
  });

  it("describes movement with and without a date", () => {
    expect(
      describeFilters({ movedToStage: { stage: Stage.INTERVIEW, since: new Date(2026, 8, 21) } }),
    ).toBe("moved to Interview since 2026-09-21");
    expect(describeFilters({ movedToStage: { stage: Stage.OFFER } })).toBe("moved to Offer");
  });

  it("describes reached-but-not-hired and exclusions", () => {
    expect(describeFilters({ reachedStageNotHired: Stage.OFFER })).toBe("reached Offer but not hired");
    expect(describeFilters({ excludeStages: [Stage.REJECTED, Stage.HIRED] })).toBe(
      "excluding Rejected, Hired",
    );
  });

  it("joins multiple conditions", () => {
    expect(
      describeFilters({
        name: { query: "Priya" },
        currentStage: Stage.SCREENING,
        currentStageDuration: { operator: ">", durationDays: 7 },
      }),
    ).toBe('name similar to "Priya"; currently in Screening; in current stage more than 7 days');
  });

  it("describes an empty filter set as everyone", () => {
    expect(describeFilters({})).toBe("no filters (everyone)");
  });
});
