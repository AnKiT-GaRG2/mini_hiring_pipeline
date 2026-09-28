import { z } from "zod";
import { Stage } from "@prisma/client";
import { RequestValidationError } from "../domain/errors";

const createCandidateSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200, "name is too long"),
  email: z.string().trim().min(1, "email is required").email("email must be a valid email address"),
  phone: z.string().trim().min(1, "phone must not be empty").max(50, "phone is too long").optional(),
});

export type CreateCandidateBody = z.infer<typeof createCandidateSchema>;

export function parseCreateCandidateBody(body: unknown): CreateCandidateBody {
  const result = createCandidateSchema.safeParse(body);
  if (!result.success) throw new RequestValidationError(result.error);
  return result.data;
}

const transitionSchema = z.object({
  toStage: z.nativeEnum(Stage, {
    errorMap: () => ({ message: `toStage must be one of: ${Object.values(Stage).join(", ")}` }),
  }),
});

export type TransitionBody = z.infer<typeof transitionSchema>;

export function parseTransitionBody(body: unknown): TransitionBody {
  const result = transitionSchema.safeParse(body);
  if (!result.success) throw new RequestValidationError(result.error);
  return result.data;
}

const listCandidatesQuerySchema = z.object({
  stage: z
    .nativeEnum(Stage, {
      errorMap: () => ({ message: `stage must be one of: ${Object.values(Stage).join(", ")}` }),
    })
    .optional(),
});

export type ListCandidatesQuery = z.infer<typeof listCandidatesQuerySchema>;

export function parseListCandidatesQuery(query: unknown): ListCandidatesQuery {
  const result = listCandidatesQuerySchema.safeParse(query);
  if (!result.success) throw new RequestValidationError(result.error);
  return result.data;
}
