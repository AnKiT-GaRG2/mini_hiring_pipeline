import { ActivityType, InterviewStatus, InterviewType, Prisma, Stage, User, UserStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import { CandidateNotFoundError, ConflictError, NotFoundError } from "../domain/errors";
import type { CreateInterviewBody, UpdateInterviewBody } from "../validation/interview.validation";
import { notifyUsers, recordActivity } from "./activity.service";

export const interviewInclude = {
  candidate: { select: { id: true, name: true, currentStage: true, job: { select: { id: true, title: true } } } },
  interviewers: { include: { user: { select: { id: true, name: true } } } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.InterviewInclude;

type InterviewRow = Prisma.InterviewGetPayload<{ include: typeof interviewInclude }>;

const MINUTE_MS = 60 * 1000;
/** A little slack so "now" typed into a form a moment ago still counts as now. */
const PAST_GRACE_MS = 5 * MINUTE_MS;

export function toInterviewResponse(row: InterviewRow) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    durationMinutes: Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / MINUTE_MS),
    platform: row.platform,
    meetingLink: row.meetingLink,
    location: row.location,
    notes: row.notes,
    candidate: {
      id: row.candidate.id,
      name: row.candidate.name,
      currentStage: row.candidate.currentStage,
      job: row.candidate.job,
    },
    interviewers: row.interviewers.map((p) => p.user).sort((a, b) => a.name.localeCompare(b.name)),
    createdBy: row.createdBy,
  };
}

const TYPE_LABELS: Record<InterviewType, string> = {
  INITIAL: "Initial",
  TECHNICAL: "Technical",
  HR: "HR",
  PANEL: "Panel",
  HIRING_MANAGER: "Hiring manager",
  OFFER_DISCUSSION: "Offer discussion",
};

function whenLabel(date: Date): string {
  return `${date.toLocaleString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} UTC`;
}

const href = (interview: { id: string; startsAt: Date }) =>
  `/calendar?date=${interview.startsAt.toISOString().slice(0, 10)}&open=${interview.id}`;

async function requireActiveInterviewers(tx: Prisma.TransactionClient, ids: string[]) {
  const users = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } });
  const found = new Map(users.map((u) => [u.id, u]));
  for (const id of ids) {
    const user = found.get(id);
    if (!user) throw new NotFoundError("Team member", id);
    if (user.status !== UserStatus.ACTIVE) throw new ConflictError("A deactivated team member can’t be an interviewer.");
  }
}

/** Nobody — candidate or interviewer — can be in two scheduled interviews at once. */
async function assertNoOverlap(
  tx: Prisma.TransactionClient,
  slot: { startsAt: Date; endsAt: Date; candidateId: string; interviewerIds: string[]; excludeId?: string },
) {
  const clash = await tx.interview.findFirst({
    where: {
      status: InterviewStatus.SCHEDULED,
      startsAt: { lt: slot.endsAt },
      endsAt: { gt: slot.startsAt },
      ...(slot.excludeId ? { id: { not: slot.excludeId } } : {}),
      OR: [{ candidateId: slot.candidateId }, { interviewers: { some: { userId: { in: slot.interviewerIds } } } }],
    },
    include: { candidate: { select: { name: true } }, interviewers: { include: { user: { select: { name: true, id: true } } } } },
  });
  if (!clash) return;

  if (clash.candidateId === slot.candidateId) {
    throw new ConflictError(`${clash.candidate.name} already has an interview at that time.`);
  }
  const busy = clash.interviewers.find((p) => slot.interviewerIds.includes(p.userId));
  throw new ConflictError(`${busy?.user.name ?? "An interviewer"} is already booked for another interview at that time.`);
}

/** Serialises scheduling so two requests can't both pass the overlap check for the same slot. */
async function lockScheduling(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('interview-scheduling'))`;
}

function assertNotInPast(startsAt: Date, now: Date) {
  if (startsAt.getTime() < now.getTime() - PAST_GRACE_MS) {
    throw new ConflictError("An interview can’t be scheduled in the past.");
  }
}

export async function listInterviews(filter: { from: Date; to: Date; status?: InterviewStatus; candidateId?: string }) {
  const rows = await prisma.interview.findMany({
    where: {
      startsAt: { gte: filter.from, lt: filter.to },
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.candidateId ? { candidateId: filter.candidateId } : {}),
    },
    include: interviewInclude,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toInterviewResponse);
}

export async function listCandidateInterviews(candidateId: string) {
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { id: true } });
  if (!candidate) throw new CandidateNotFoundError(candidateId);
  const rows = await prisma.interview.findMany({
    where: { candidateId },
    include: interviewInclude,
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
  });
  return rows.map(toInterviewResponse);
}

export async function listUpcoming(limit: number, now: Date = new Date()) {
  const rows = await prisma.interview.findMany({
    // Includes one already under way: it's still "up next" until it ends.
    where: { status: InterviewStatus.SCHEDULED, endsAt: { gt: now } },
    include: interviewInclude,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: limit,
  });
  return rows.map(toInterviewResponse);
}

export async function getInterview(id: string) {
  const row = await prisma.interview.findUnique({ where: { id }, include: interviewInclude });
  if (!row) throw new NotFoundError("Interview", id);
  return toInterviewResponse(row);
}

export async function getInterviewStats(
  ranges: { todayFrom: Date; todayTo: Date; weekFrom: Date; weekTo: Date },
  now: Date = new Date(),
) {
  const scheduledIn = (from: Date, to: Date) =>
    prisma.interview.count({ where: { status: InterviewStatus.SCHEDULED, startsAt: { gte: from, lt: to } } });

  const [today, week, upcoming, offers] = await Promise.all([
    scheduledIn(ranges.todayFrom, ranges.todayTo),
    scheduledIn(ranges.weekFrom, ranges.weekTo),
    prisma.interview.count({ where: { status: InterviewStatus.SCHEDULED, startsAt: { gte: now } } }),
    prisma.candidate.count({ where: { currentStage: Stage.OFFER } }),
  ]);
  return { today, week, upcoming, offers };
}

export async function scheduleInterview(input: CreateInterviewBody, actor: User, now: Date = new Date()) {
  assertNotInPast(input.startsAt, now);
  const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * MINUTE_MS);
  const interviewerIds = input.interviewerIds && input.interviewerIds.length > 0 ? input.interviewerIds : [actor.id];

  return prisma.$transaction(async (tx) => {
    await lockScheduling(tx);

    const candidate = await tx.candidate.findUnique({ where: { id: input.candidateId }, select: { id: true, name: true, currentStage: true, jobId: true } });
    if (!candidate) throw new CandidateNotFoundError(input.candidateId);
    if (candidate.currentStage === Stage.HIRED || candidate.currentStage === Stage.REJECTED) {
      throw new ConflictError(`${candidate.name} is ${candidate.currentStage === Stage.HIRED ? "already hired" : "rejected"}, so no interview can be scheduled.`);
    }
    await requireActiveInterviewers(tx, interviewerIds);
    await assertNoOverlap(tx, { startsAt: input.startsAt, endsAt, candidateId: candidate.id, interviewerIds });

    const created = await tx.interview.create({
      data: {
        candidateId: candidate.id,
        type: input.type,
        startsAt: input.startsAt,
        endsAt,
        platform: input.platform,
        meetingLink: input.meetingLink ?? null,
        location: input.location ?? null,
        notes: input.notes ?? null,
        createdById: actor.id,
        interviewers: { create: interviewerIds.map((userId) => ({ userId })) },
      },
      include: interviewInclude,
    });

    await recordActivity(tx, {
      type: ActivityType.INTERVIEW_SCHEDULED,
      candidateId: candidate.id,
      jobId: candidate.jobId,
      actorId: actor.id,
      metadata: { interviewType: input.type, startsAt: input.startsAt.toISOString() },
    });
    await notifyUsers(tx, interviewerIds, {
      exceptUserId: actor.id,
      title: `${TYPE_LABELS[input.type]} interview with ${candidate.name}`,
      body: whenLabel(input.startsAt),
      href: href(created),
    });

    return toInterviewResponse(created);
  });
}

export async function updateInterview(id: string, patch: UpdateInterviewBody, actor: User, now: Date = new Date()) {
  return prisma.$transaction(async (tx) => {
    await lockScheduling(tx);

    const existing = await tx.interview.findUnique({
      where: { id },
      include: { candidate: { select: { id: true, name: true, jobId: true } }, interviewers: true },
    });
    if (!existing) throw new NotFoundError("Interview", id);
    if (existing.status !== InterviewStatus.SCHEDULED) {
      throw new ConflictError(`This interview is ${existing.status.toLowerCase()} and can no longer be changed.`);
    }

    const startsAt = patch.startsAt ?? existing.startsAt;
    const durationMs = patch.durationMinutes !== undefined ? patch.durationMinutes * MINUTE_MS : existing.endsAt.getTime() - existing.startsAt.getTime();
    const endsAt = new Date(startsAt.getTime() + durationMs);
    const interviewerIds = patch.interviewerIds ?? existing.interviewers.map((p) => p.userId);

    const movesInTime = startsAt.getTime() !== existing.startsAt.getTime() || endsAt.getTime() !== existing.endsAt.getTime();
    const closing = patch.status !== undefined;

    if (movesInTime && !closing) {
      assertNotInPast(startsAt, now);
      await assertNoOverlap(tx, { startsAt, endsAt, candidateId: existing.candidateId, interviewerIds, excludeId: id });
    }
    if (patch.interviewerIds) {
      await requireActiveInterviewers(tx, interviewerIds);
      await assertNoOverlap(tx, { startsAt, endsAt, candidateId: existing.candidateId, interviewerIds, excludeId: id });
    }

    const updated = await tx.interview.update({
      where: { id },
      data: {
        type: patch.type,
        startsAt: closing ? undefined : startsAt,
        endsAt: closing ? undefined : endsAt,
        platform: patch.platform,
        meetingLink: patch.meetingLink,
        location: patch.location,
        notes: patch.notes,
        status: patch.status,
        ...(patch.interviewerIds
          ? { interviewers: { deleteMany: {}, create: interviewerIds.map((userId) => ({ userId })) } }
          : {}),
      },
      include: interviewInclude,
    });

    const type = patch.type ?? existing.type;
    const activityType =
      patch.status === InterviewStatus.CANCELLED
        ? ActivityType.INTERVIEW_CANCELLED
        : patch.status === InterviewStatus.COMPLETED
          ? ActivityType.INTERVIEW_COMPLETED
          : movesInTime
            ? ActivityType.INTERVIEW_RESCHEDULED
            : null;

    if (activityType) {
      await recordActivity(tx, {
        type: activityType,
        candidateId: existing.candidateId,
        jobId: existing.candidate.jobId,
        actorId: actor.id,
        metadata: { interviewType: type, startsAt: startsAt.toISOString() },
      });
    }
    if (activityType === ActivityType.INTERVIEW_RESCHEDULED || activityType === ActivityType.INTERVIEW_CANCELLED) {
      const cancelled = activityType === ActivityType.INTERVIEW_CANCELLED;
      await notifyUsers(tx, interviewerIds, {
        exceptUserId: actor.id,
        title: `${TYPE_LABELS[type]} interview with ${existing.candidate.name} ${cancelled ? "was cancelled" : "was rescheduled"}`,
        body: cancelled ? undefined : whenLabel(startsAt),
        href: href(updated),
      });
    }

    return toInterviewResponse(updated);
  });
}
