import type { DurationOperator, MatchType, ParsedQuery } from '../api/types'
import { formatDate } from './format'
import { STAGE_LABELS } from './stages'

const OPERATOR_WORDS: Record<DurationOperator, string> = {
  '>': 'More than',
  '>=': 'At least',
  '<': 'Less than',
  '<=': 'At most',
  '=': 'Exactly',
}

/** "Current stage = Interview", "More than 7 days in current stage", … — one label per filter the backend applied. */
export function describeFilters(parsed: ParsedQuery): string[] {
  const labels: string[] = []

  if (parsed.name) labels.push(`Name similar to “${parsed.name.query}”`)
  if (parsed.currentStage) labels.push(`Current stage = ${STAGE_LABELS[parsed.currentStage]}`)

  if (parsed.currentStageDuration) {
    const { operator, durationDays } = parsed.currentStageDuration
    labels.push(`${OPERATOR_WORDS[operator]} ${durationDays} day${durationDays === 1 ? '' : 's'} in current stage`)
  }

  if (parsed.movedToStage) {
    const { stage, since } = parsed.movedToStage
    labels.push(`Moved to ${STAGE_LABELS[stage]}${since ? ` since ${formatDate(since)}` : ''}`)
  }

  if (parsed.reachedStageNotHired) labels.push(`Reached ${STAGE_LABELS[parsed.reachedStageNotHired]} but not hired`)
  if (parsed.excludeStages?.length) labels.push(`Excluding ${parsed.excludeStages.map((s) => STAGE_LABELS[s]).join(', ')}`)

  return labels
}

/** Why one candidate matched the name part of the query. */
export function describeMatch(matchType: MatchType, nameQuery: string): string {
  switch (matchType) {
    case 'exact':
      return 'Exact name match'
    case 'prefix':
      return `Name starts with “${nameQuery}”`
    case 'word':
      return `Name contains “${nameQuery}”`
    case 'fuzzy':
      return 'Fuzzy name match'
  }
}

/** True when the only thing understood from the query was a name to look up. */
export function isNameOnly(parsed: ParsedQuery): boolean {
  const used = Object.entries(parsed).filter(([, value]) => value !== undefined)
  return used.length === 1 && used[0][0] === 'name'
}

export function countLabel(count: number): string {
  return `${count} candidate${count === 1 ? '' : 's'} found`
}

const GENERIC_PARSE_MESSAGE = /^I couldn['’]t understand this search\.?\s*/i

/**
 * The backend always opens an un-parseable search with its generic sentence,
 * which the UI already says in its own heading. What follows it (or a
 * specific message such as an unknown stage) is the useful part.
 */
export function extraParseDetail(message: string): string {
  return message.replace(GENERIC_PARSE_MESSAGE, '').trim()
}

/** What can be searched, with a real example of each. Shown whenever a search can't be understood. */
export const SEARCH_HELP: readonly { topic: string; example: string }[] = [
  { topic: 'Candidate name', example: 'Priya Sharma — or a typo like “sharam”' },
  { topic: 'Current stage', example: 'Who’s in Interview right now?' },
  { topic: 'Time in stage', example: 'Stuck in Screening for more than a week' },
  { topic: 'Stage movement', example: 'Moved to Interview since Monday' },
  { topic: 'Hiring outcome', example: 'Reached Offer but didn’t get hired' },
  { topic: 'Excluding a stage', example: 'Everyone except rejected candidates' },
]
