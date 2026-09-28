import { describe, it, expect } from "vitest";
import { matchOneOf, soleWord } from "../../src/search/wordMatch";

describe("soleWord", () => {
  it("passes through a single alphabetic word, trimmed and lowercased", () => {
    expect(soleWord("Hired")).toBe("hired");
    expect(soleWord("  hired  ")).toBe("hired");
  });

  it("is undefined for anything with more than one word, or non-letters", () => {
    expect(soleWord("hired candidates")).toBeUndefined();
    expect(soleWord("hr1red")).toBeUndefined();
    expect(soleWord("")).toBeUndefined();
    expect(soleWord("   ")).toBeUndefined();
  });
});

describe("matchOneOf", () => {
  const VOCAB = ["applied", "screening", "interview", "offer", "hired", "rejected"];

  it("matches an exact word regardless of length", () => {
    expect(matchOneOf("offer", VOCAB)).toBe("offer");
  });

  it("matches a unique prefix from 3 letters", () => {
    expect(matchOneOf("hir", VOCAB)).toBe("hired");
    expect(matchOneOf("int", VOCAB)).toBe("interview");
    expect(matchOneOf("scr", VOCAB)).toBe("screening");
    expect(matchOneOf("app", VOCAB)).toBe("applied");
    expect(matchOneOf("off", VOCAB)).toBe("offer");
    expect(matchOneOf("rej", VOCAB)).toBe("rejected");
  });

  it("keeps predicting as more letters are typed", () => {
    for (const prefix of ["h", "hi", "hir", "hire", "hired"]) {
      expect(matchOneOf(prefix, VOCAB), prefix).toBe(prefix.length >= 3 ? "hired" : undefined);
    }
  });

  it("does not match below 3 letters, even if it would be unique", () => {
    expect(matchOneOf("h", VOCAB)).toBeUndefined();
    expect(matchOneOf("hi", VOCAB)).toBeUndefined();
  });

  it("does not match an ambiguous prefix shared by two or more entries", () => {
    expect(matchOneOf("s", ["screening", "skill"])).toBeUndefined();
    expect(matchOneOf("scr", ["screening", "scrap"])).toBeUndefined();
  });

  it("does not match a word that isn't in the vocabulary and isn't a prefix of one", () => {
    expect(matchOneOf("banana", VOCAB)).toBeUndefined();
  });
});
