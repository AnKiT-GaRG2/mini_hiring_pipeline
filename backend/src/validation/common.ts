import { z } from "zod";
import { RequestValidationError } from "../domain/errors";

export function parseWith<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new RequestValidationError(result.error);
  return result.data;
}

/** Empty strings from forms mean "not provided". */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `must be at most ${max} characters`)
    .transform((v) => (v === "" ? null : v))
    .nullish();

export const optionalUrl = z
  .string()
  .trim()
  .max(500, "URL is too long")
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), "must start with http:// or https://")
  .nullish();

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "email is required")
  .email("email must be a valid email address")
  .max(254, "email is too long");

export const idParam = z.object({ id: z.string().min(1) });
