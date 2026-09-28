import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "../../src/export/csv";

describe("csvCell", () => {
  it("leaves plain values alone and blanks null/undefined", () => {
    expect(csvCell("hello")).toBe("hello");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes cells containing commas, quotes or line breaks, doubling inner quotes", () => {
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("defuses spreadsheet formulas by prefixing an apostrophe", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@sum")).toBe("'@sum");
  });
});

describe("toCsv", () => {
  it("joins rows with CRLF and ends with a trailing newline", () => {
    expect(toCsv(["a", "b"], [["1", "2"], ["3", null]])).toBe("a,b\r\n1,2\r\n3,\r\n");
  });
});
