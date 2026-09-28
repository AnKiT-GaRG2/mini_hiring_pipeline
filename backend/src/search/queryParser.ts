import { Stage } from "@prisma/client";
import { resolveStageWord, STAGE_DISPLAY_NAMES } from "./stageWords";
import { parseSinceDate } from "./dateWords";

export type DurationOperator = ">" | ">=" | "<" | "<=" | "=";

export type ParsedFilters = {
  name?: { query: string };
  currentStage?: Stage;
  excludeStages?: Stage[];
  currentStageDuration?: { operator: DurationOperator; durationDays: number };
  movedToStage?: { stage: Stage; since?: Date };
  reachedStageNotHired?: Stage;
};

export type ParseResult =
  | { success: true; query: string; filters: ParsedFilters }
  | { success: false; query: string; message: string; supportedFilters: string[] };

export const SUPPORTED_FILTERS = [
  "candidate name (exact, prefix, or fuzzy/typo match)",
  "current stage",
  "time spent in current stage",
  "stage movement (e.g. moved to Interview)",
  "transition date (e.g. since Monday)",
  "hiring outcome (e.g. reached Offer but not hired)",
  "excluding a stage (e.g. everyone except rejected)",
];

/** Thrown when we recognize *what* the recruiter is asking about but can't
 * resolve a specific piece of it (an unknown stage word, an unparseable
 * date). Caught at the top of parseSearchQuery and turned into a specific,
 * actionable failure message — more helpful than silently ignoring it. */
class ParseError extends Error {}

const SELECT_ALL_QUERIES = new Set([
  "everyone",
  "everybody",
  "all",
  "all candidates",
  "list all candidates",
  "show all candidates",
]);

// Words stripped from whatever text extractors don't consume, before what's
// left is treated as a candidate-name query. Deliberately generous — the
// vocabulary this endpoint supports is small and fixed (see the phase brief),
// so false stopword hits cost nothing a real candidate name would trigger.
const STOPWORDS = new Set([
  "who", "whos", "is", "are", "was", "were", "in", "the", "a", "an",
  "right", "now", "has", "have", "been", "stuck", "for", "more", "than",
  "at", "least", "less", "under", "over", "exactly", "no", "since",
  "moved", "move", "to", "reached", "reach", "but", "did", "not", "do",
  "does", "get", "got", "hired", "candidates", "candidate", "everyone",
  "everybody", "people", "except", "excluding", "without", "stage",
  "please", "show", "me", "list", "find", "search", "of", "and", "or",
  "with", "currently", "still", "all", "on", "that", "this",
]);

function expandContractions(text: string): string {
  return text
    .replace(/who['’]s/gi, "who is")
    .replace(/didn['’]t/gi, "did not")
    .replace(/doesn['’]t/gi, "does not")
    .replace(/don['’]t/gi, "do not")
    .replace(/weren['’]t/gi, "were not")
    .replace(/wasn['’]t/gi, "was not")
    .replace(/isn['’]t/gi, "is not")
    .replace(/aren['’]t/gi, "are not");
}

type Extraction = { match: RegExpExecArray; rest: string };

function extractFirst(text: string, regex: RegExp): Extraction | null {
  const match = regex.exec(text);
  if (!match) return null;
  const rest = (text.slice(0, match.index) + " " + text.slice(match.index + match[0].length))
    .replace(/\s+/g, " ")
    .trim();
  return { match, rest };
}

function invalidStageError(word: string): ParseError {
  return new ParseError(
    `I understood you're referring to a stage ("${word}"), but that's not a valid stage. ` +
      `Valid stages are: ${Object.values(STAGE_DISPLAY_NAMES).join(", ")}.`,
  );
}

const NEGATION_RE =
  /\b(?:did not|were not|was not|does not|is not|are not)\s+(?:get\s+)?hired\b|\bnot\s+hired\b/i;

function extractReachedButNotHired(remaining: string): { filters: Partial<ParsedFilters>; rest: string } | null {
  const reached = extractFirst(remaining, /\breached\s+(?:the\s+)?(?<stage>\w+)(?:\s+stage)?\b/i);
  const stageCandidates = reached
    ? null
    : extractFirst(remaining, /\b(?<stage>\w+)\s+candidates?\b/i);

  const pending = reached ?? stageCandidates;
  if (!pending) return null;

  const negation = extractFirst(pending.rest, NEGATION_RE);
  if (!negation) return null; // no "not hired" clause — leave for other extractors

  const stageWord = pending.match.groups!.stage;
  const stage = resolveStageWord(stageWord);
  if (!stage) throw invalidStageError(stageWord);

  return { filters: { reachedStageNotHired: stage }, rest: negation.rest };
}

/** "reached <Stage>" with no "not hired" clause: has ever entered that stage. */
function extractReachedStage(remaining: string): { filters: Partial<ParsedFilters>; rest: string } | null {
  const found = extractFirst(remaining, /\breached\s+(?:the\s+)?(?<stage>\w+)(?:\s+stage)?\b/i);
  if (!found) return null;
  const stage = resolveStageWord(found.match.groups!.stage);
  if (!stage) return null; // lenient: "reached out" etc. shouldn't error
  return { filters: { movedToStage: { stage } }, rest: found.rest };
}

function extractExclusion(remaining: string): { filters: Partial<ParsedFilters>; rest: string } | null {
  const found = extractFirst(remaining, /\b(?:except|excluding|without)\s+(?<stage>\w+)(?:\s+candidates?)?\b/i);
  if (!found) return null;

  const stageWord = found.match.groups!.stage;
  const stage = resolveStageWord(stageWord);
  if (!stage) throw invalidStageError(stageWord);

  return { filters: { excludeStages: [stage] }, rest: found.rest };
}

function extractMovedToStage(
  remaining: string,
  now: Date,
): { filters: Partial<ParsedFilters>; rest: string } | null {
  const found = extractFirst(
    remaining,
    /\bmoved\s+to\s+(?:the\s+)?(?<stage>\w+)(?:\s+stage)?(?:\s+since\s+(?<since>[a-z0-9-]+(?:\s+[a-z0-9-]+){0,3}))?\b/i,
  );
  if (!found) return null;

  const stageWord = found.match.groups!.stage;
  const stage = resolveStageWord(stageWord);
  if (!stage) throw invalidStageError(stageWord);

  const sincePhrase = found.match.groups!.since;
  let since: Date | undefined;
  if (sincePhrase) {
    since = parseSinceDate(sincePhrase, now);
    if (!since) {
      throw new ParseError(
        `I understood you're referencing a date ("${sincePhrase}"), but couldn't parse it. ` +
          `Try a weekday name (e.g. "Monday"), "today", "yesterday", "N days ago", or YYYY-MM-DD.`,
      );
    }
  }

  return { filters: { movedToStage: { stage, since } }, rest: found.rest };
}

function extractCurrentStageDuration(remaining: string): { filters: Partial<ParsedFilters>; rest: string } | null {
  const found = extractFirst(
    remaining,
    /\bin\s+(?:the\s+)?(?<stage>\w+)(?:\s+stage)?\s+for\s+(?<comparator>more than|at least|less than|at most|no more than|over|under|exactly)?\s*(?<amount>a|an|\d+)\s*(?<unit>days?|weeks?)\b/i,
  );
  if (!found) return null;

  const stageWord = found.match.groups!.stage;
  const stage = resolveStageWord(stageWord);
  if (!stage) throw invalidStageError(stageWord);

  const { comparator, amount, unit } = found.match.groups!;
  const operator: DurationOperator = (() => {
    switch (comparator?.toLowerCase()) {
      case "more than":
      case "over":
        return ">";
      case "at least":
        return ">=";
      case "less than":
      case "under":
        return "<";
      case "at most":
      case "no more than":
        return "<=";
      case "exactly":
        return "=";
      default:
        return ">="; // bare "for N days" reads as "has been there at least N days"
    }
  })();

  const amountNumber = amount === "a" || amount === "an" ? 1 : Number(amount);
  const multiplier = unit.toLowerCase().startsWith("week") ? 7 : 1;

  return {
    filters: { currentStage: stage, currentStageDuration: { operator, durationDays: amountNumber * multiplier } },
    rest: found.rest,
  };
}

function extractBareStageCandidates(remaining: string): { filters: Partial<ParsedFilters>; rest: string } | null {
  const found = extractFirst(remaining, /\b(?<stage>\w+)\s+candidates?\b/i);
  if (!found) return null;
  const stage = resolveStageWord(found.match.groups!.stage);
  if (!stage) return null; // lenient: "all candidates" etc. shouldn't error
  return { filters: { currentStage: stage }, rest: found.rest };
}

function extractBareCurrentStage(remaining: string): { filters: Partial<ParsedFilters>; rest: string } | null {
  const found = extractFirst(remaining, /\bin\s+(?:the\s+)?(?<stage>\w+)(?:\s+stage)?\b/i);
  if (!found) return null;
  const stage = resolveStageWord(found.match.groups!.stage);
  if (!stage) return null; // lenient: "in progress" etc. shouldn't error
  return { filters: { currentStage: stage }, rest: found.rest };
}

function extractHiringOutcomeVerb(remaining: string): { filters: Partial<ParsedFilters>; rest: string } | null {
  const hired = extractFirst(remaining, /\b(?:got|was|were|is|are)\s+hired\b/i);
  if (hired) return { filters: { currentStage: Stage.HIRED }, rest: hired.rest };

  const rejected = extractFirst(remaining, /\b(?:got|was|were|is|are)\s+rejected\b/i);
  if (rejected) return { filters: { currentStage: Stage.REJECTED }, rest: rejected.rest };

  return null;
}

function stripLeadingFiller(text: string): string {
  return text.replace(/^(?:find|search for|show me|list|who is|get)\s+/i, "").trim();
}

/** A query that is nothing but a stage word ("hired", "Interview") means that stage. */
function extractBareStageWord(remaining: string): Stage | undefined {
  const tokens = stripLeadingFiller(remaining)
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w.toLowerCase()) || resolveStageWord(w) !== undefined);
  return tokens.length === 1 ? resolveStageWord(tokens[0]) : undefined;
}

function extractNameFromLeftover(remaining: string): string | undefined {
  const withoutFiller = stripLeadingFiller(remaining);
  const words = withoutFiller.split(/\s+/).filter(Boolean);
  const nameWords = words.filter((w) => !STOPWORDS.has(w.toLowerCase()));
  const name = nameWords.join(" ").trim();
  return name.length > 0 ? name : undefined;
}

/**
 * Deterministically parses a recruiter's free-text search into structured
 * filters. No LLM, no ML model — a fixed pipeline of regex extractors over a
 * small, documented vocabulary (see SUPPORTED_FILTERS / the README's query
 * grammar section). Each extractor either fully matches a known pattern and
 * consumes it, or doesn't match at all; unconsumed text left after every
 * extractor has run is treated as a candidate-name query.
 */
export function parseSearchQuery(rawQuery: string, now: Date = new Date()): ParseResult {
  const trimmed = rawQuery.trim();

  if (!trimmed) {
    return {
      success: false,
      query: rawQuery,
      message: "I couldn't understand this search. The query was empty.",
      supportedFilters: SUPPORTED_FILTERS,
    };
  }

  if (SELECT_ALL_QUERIES.has(trimmed.toLowerCase())) {
    return { success: true, query: rawQuery, filters: {} };
  }

  let remaining = expandContractions(trimmed)
    .replace(/[?!.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const filters: ParsedFilters = {};

  try {
    for (const extractor of [
      extractReachedButNotHired,
      extractReachedStage,
      extractExclusion,
      (text: string) => extractMovedToStage(text, now),
      extractCurrentStageDuration,
      extractBareStageCandidates,
      extractBareCurrentStage,
      extractHiringOutcomeVerb,
    ]) {
      const result = extractor(remaining);
      if (result) {
        Object.assign(filters, result.filters);
        remaining = result.rest;
      }
    }
  } catch (err) {
    if (err instanceof ParseError) {
      return { success: false, query: rawQuery, message: err.message, supportedFilters: SUPPORTED_FILTERS };
    }
    throw err;
  }

  if (!filters.currentStage) {
    const bareStage = extractBareStageWord(remaining);
    if (bareStage) {
      filters.currentStage = bareStage;
      remaining = "";
    }
  }

  const name = extractNameFromLeftover(remaining);
  if (name) filters.name = { query: name };

  const hasAnyFilter = Object.keys(filters).length > 0;
  if (!hasAnyFilter) {
    return {
      success: false,
      query: rawQuery,
      message: "I couldn't understand this search.",
      supportedFilters: SUPPORTED_FILTERS,
    };
  }

  return { success: true, query: rawQuery, filters };
}
