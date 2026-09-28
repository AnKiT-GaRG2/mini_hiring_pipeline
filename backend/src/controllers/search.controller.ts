import { Request, Response } from "express";
import { describeFilters } from "../search/describeFilters";
import { parseSearchQuery } from "../search/queryParser";
import { searchCandidates } from "../services/search.service";
import { parseSearchQueryParams } from "../validation/search.validation";
import { toCandidateResponse } from "./candidate.presenter";

export async function search(req: Request, res: Response) {
  const { q } = parseSearchQueryParams(req.query);
  const parsed = parseSearchQuery(q);

  if (!parsed.success) {
    res.status(200).json({
      success: false,
      query: parsed.query,
      message: parsed.message,
      supportedFilters: parsed.supportedFilters,
      results: [],
    });
    return;
  }

  const ranked = await searchCandidates(parsed.filters);

  res.status(200).json({
    success: true,
    query: parsed.query,
    parsedQuery: parsed.filters,
    ...(ranked.length === 0
      ? { message: `No candidates matched. I interpreted your search as: ${describeFilters(parsed.filters)}.` }
      : {}),
    results: ranked.map(({ candidate, score, matchType }) => ({
      ...toCandidateResponse(candidate),
      score,
      matchType,
    })),
  });
}
