import { z } from "zod";
import { InterviewStatus, InterviewType, MeetingPlatform } from "@prisma/client";
import { optionalText, optionalUrl, parseWith } from "./common";

const instant = z
  .string()
  .datetime({ offset: true, message: "must be an ISO date-time like 2026-10-01T09:00:00Z" })
  .transform((v) => new Date(v));

const duration = z.number().int("must be a whole number of minutes").min(15, "at least 15 minutes").max(480, "at most 8 hours");

/** Trim, drop blanks and duplicates, keep order. */
const interviewerIds = z
  .array(z.string().min(1))
  .max(8, "at most 8 interviewers")
  .transform((ids) => [...new Set(ids)]);

const createInterviewSchema = z.object({
  candidateId: z.string().min(1, "candidateId is required"),
  type: z.nativeEnum(InterviewType),
  startsAt: instant,
  durationMinutes: duration.default(45),
  platform: z.nativeEnum(MeetingPlatform).default(MeetingPlatform.GOOGLE_MEET),
  meetingLink: optionalUrl,
  location: optionalText(200),
  notes: optionalText(2000),
  interviewerIds: interviewerIds.optional(),
});
export type CreateInterviewBody = z.infer<typeof createInterviewSchema>;
export const parseCreateInterviewBody = (body: unknown) => parseWith(createInterviewSchema, body);

// Only these two statuses can be requested; SCHEDULED is where an interview starts.
const finalStatus = z.enum([InterviewStatus.COMPLETED, InterviewStatus.CANCELLED]);

const updateInterviewSchema = z
  .object({
    type: z.nativeEnum(InterviewType),
    startsAt: instant,
    durationMinutes: duration,
    platform: z.nativeEnum(MeetingPlatform),
    meetingLink: optionalUrl,
    location: optionalText(200),
    notes: optionalText(2000),
    interviewerIds: interviewerIds.pipe(z.array(z.string()).min(1, "at least one interviewer is required")),
    status: finalStatus,
  })
  .partial();
export type UpdateInterviewBody = z.infer<typeof updateInterviewSchema>;
export const parseUpdateInterviewBody = (body: unknown) => parseWith(updateInterviewSchema, body);

const MAX_RANGE_DAYS = 100;

const isoInstant = z.string().datetime({ offset: true, message: "must be an ISO date-time" }).transform((v) => new Date(v));

const rangeShape = { from: isoInstant, to: isoInstant };

function rangeIsSane(r: { from: Date; to: Date }) {
  return r.to > r.from && r.to.getTime() - r.from.getTime() <= MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
}
const rangeMessage = { message: `"to" must be after "from", and at most ${MAX_RANGE_DAYS} days later` };

export const parseListInterviewsQuery = (query: unknown) =>
  parseWith(
    z
      .object({
        ...rangeShape,
        status: z.nativeEnum(InterviewStatus).optional(),
        candidateId: z.string().min(1).optional(),
      })
      .refine(rangeIsSane, rangeMessage),
    query,
  );

export const parseUpcomingQuery = (query: unknown) =>
  parseWith(z.object({ limit: z.coerce.number().int().min(1).max(20).default(4) }), query);

/** The client decides where "today" and "this week" start, because that depends on its time zone. */
export const parseInterviewStatsQuery = (query: unknown) =>
  parseWith(
    z.object({
      todayFrom: isoInstant,
      todayTo: isoInstant,
      weekFrom: isoInstant,
      weekTo: isoInstant,
    }),
    query,
  );
