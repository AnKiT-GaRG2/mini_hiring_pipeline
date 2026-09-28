/**
 * Minimal RFC 4180 CSV writer.
 *
 * Cells that start with = + - @ (or a tab/CR) are prefixed with an apostrophe.
 * Spreadsheet apps execute such cells as formulas, and every field here is
 * user-supplied (a candidate can be named `=HYPERLINK(...)`).
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
