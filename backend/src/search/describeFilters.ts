import { DurationOperator, ParsedFilters } from "./queryParser";
import { STAGE_DISPLAY_NAMES } from "./stageWords";

const OPERATOR_WORDS: Record<DurationOperator, string> = {
  ">": "more than",
  ">=": "at least",
  "<": "less than",
  "<=": "at most",
  "=": "exactly",
};

function formatLocalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Plain-English summary of how a query was interpreted. Shown when a search
 * returns nothing so the recruiter can spot a misread (e.g. an unrecognized
 * word that was treated as a candidate name) instead of just seeing [].
 */
export function describeFilters(filters: ParsedFilters): string {
  const parts: string[] = [];

  if (filters.name) parts.push(`name similar to "${filters.name.query}"`);

  if (filters.currentStage) {
    parts.push(`currently in ${STAGE_DISPLAY_NAMES[filters.currentStage]}`);
  }

  if (filters.excludeStages?.length) {
    parts.push(`excluding ${filters.excludeStages.map((s) => STAGE_DISPLAY_NAMES[s]).join(", ")}`);
  }

  if (filters.currentStageDuration) {
    const { operator, durationDays } = filters.currentStageDuration;
    parts.push(`in current stage ${OPERATOR_WORDS[operator]} ${durationDays} day${durationDays === 1 ? "" : "s"}`);
  }

  if (filters.movedToStage) {
    const { stage, since } = filters.movedToStage;
    parts.push(
      `moved to ${STAGE_DISPLAY_NAMES[stage]}` + (since ? ` since ${formatLocalDate(since)}` : ""),
    );
  }

  if (filters.reachedStageNotHired) {
    parts.push(`reached ${STAGE_DISPLAY_NAMES[filters.reachedStageNotHired]} but not hired`);
  }

  return parts.length > 0 ? parts.join("; ") : "no filters (everyone)";
}
