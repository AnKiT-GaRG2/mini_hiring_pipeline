import { z } from "zod";
import { parseWith } from "./common";

export const PERIOD_DAYS = [7, 30, 90] as const;

export const parseDashboardQuery = (query: unknown) =>
  parseWith(
    z.object({
      jobId: z.string().min(1).optional(),
      days: z.coerce
        .number()
        .refine((d): d is (typeof PERIOD_DAYS)[number] => (PERIOD_DAYS as readonly number[]).includes(d), {
          message: `days must be one of: ${PERIOD_DAYS.join(", ")}`,
        })
        .default(30),
    }),
    query,
  );

export const parseActivityQuery = (query: unknown) =>
  parseWith(
    z.object({
      jobId: z.string().min(1).optional(),
      candidateId: z.string().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(10),
      before: z
        .string()
        .datetime({ offset: true, message: "must be an ISO date-time" })
        .transform((v) => new Date(v))
        .optional(),
    }),
    query,
  );

export const parseNotificationsReadBody = (body: unknown) =>
  parseWith(z.object({ ids: z.array(z.string().min(1)).max(200).optional() }), body ?? {});
