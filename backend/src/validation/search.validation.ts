import { z } from "zod";
import { RequestValidationError } from "../domain/errors";

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "q is required"),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export function parseSearchQueryParams(query: unknown): SearchQuery {
  const result = searchQuerySchema.safeParse(query);
  if (!result.success) throw new RequestValidationError(result.error);
  return result.data;
}
