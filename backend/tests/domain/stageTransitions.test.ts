import { describe, it, expect } from "vitest";
import { Stage } from "@prisma/client";
import { validateTransition } from "../../src/domain/stageTransitions";

describe("validateTransition", () => {
  it("allows each step of the forward path", () => {
    expect(validateTransition(Stage.APPLIED, Stage.SCREENING)).toEqual({ valid: true });
    expect(validateTransition(Stage.SCREENING, Stage.INTERVIEW)).toEqual({ valid: true });
    expect(validateTransition(Stage.INTERVIEW, Stage.OFFER)).toEqual({ valid: true });
    expect(validateTransition(Stage.OFFER, Stage.HIRED)).toEqual({ valid: true });
  });

  it("allows any non-final stage to move to Rejected", () => {
    expect(validateTransition(Stage.APPLIED, Stage.REJECTED).valid).toBe(true);
    expect(validateTransition(Stage.SCREENING, Stage.REJECTED).valid).toBe(true);
    expect(validateTransition(Stage.INTERVIEW, Stage.REJECTED).valid).toBe(true);
    expect(validateTransition(Stage.OFFER, Stage.REJECTED).valid).toBe(true);
  });

  it("rejects skipping stages", () => {
    const result = validateTransition(Stage.APPLIED, Stage.INTERVIEW);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/skip/i);
  });

  it("rejects skipping multiple stages at once", () => {
    const result = validateTransition(Stage.APPLIED, Stage.OFFER);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/skip/i);
  });

  it("rejects moving backwards", () => {
    const result = validateTransition(Stage.INTERVIEW, Stage.SCREENING);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/backwards/i);
  });

  it("rejects a no-op transition to the same stage", () => {
    const result = validateTransition(Stage.SCREENING, Stage.SCREENING);
    expect(result.valid).toBe(false);
  });

  it("Hired is final: rejects any transition away from Hired, including to Rejected", () => {
    expect(validateTransition(Stage.HIRED, Stage.REJECTED)).toEqual({
      valid: false,
      reason: "Hired is a final stage and cannot be changed.",
    });
    expect(validateTransition(Stage.HIRED, Stage.OFFER).valid).toBe(false);
    expect(validateTransition(Stage.HIRED, Stage.APPLIED).valid).toBe(false);
  });

  it("Rejected is final: rejects any transition away from Rejected", () => {
    expect(validateTransition(Stage.REJECTED, Stage.APPLIED)).toEqual({
      valid: false,
      reason: "Rejected is a final stage and cannot be changed.",
    });
    expect(validateTransition(Stage.REJECTED, Stage.HIRED).valid).toBe(false);
    expect(validateTransition(Stage.REJECTED, Stage.SCREENING).valid).toBe(false);
  });
});
