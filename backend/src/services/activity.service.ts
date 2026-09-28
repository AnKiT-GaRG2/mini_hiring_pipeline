import { ActivityType, Prisma, Stage, UserStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import { STAGE_DISPLAY_NAMES } from "../search/stageWords";

type Tx = Prisma.TransactionClient;

export type ActivityMetadata = {
  fromStage?: Stage;
  toStage?: Stage;
  interviewType?: string;
  startsAt?: string;
  jobTitle?: string;
};

/**
 * Appends to the activity feed. Always called inside the transaction of the
 * action it describes, so the feed can never show something that was rolled back.
 */
export async function recordActivity(
  tx: Tx,
  entry: {
    type: ActivityType;
    candidateId?: string | null;
    jobId?: string | null;
    actorId?: string | null;
    metadata?: ActivityMetadata;
    at?: Date;
  },
) {
  await tx.activity.create({
    data: {
      type: entry.type,
      candidateId: entry.candidateId ?? null,
      jobId: entry.jobId ?? null,
      actorId: entry.actorId ?? null,
      metadata: (entry.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
      ...(entry.at ? { createdAt: entry.at } : {}),
    },
  });
}

/** Tells specific team members (skipping the person who did the thing, and anyone deactivated). */
export async function notifyUsers(
  tx: Tx,
  userIds: string[],
  note: { exceptUserId?: string | null; title: string; body?: string; href?: string },
) {
  const recipients = await tx.user.findMany({
    where: { status: UserStatus.ACTIVE, id: { in: userIds.filter((id) => id !== note.exceptUserId) } },
    select: { id: true },
  });
  if (recipients.length === 0) return;
  await tx.notification.createMany({
    data: recipients.map((r) => ({ userId: r.id, title: note.title, body: note.body, href: note.href })),
  });
}

/** Tells every active team member except the person who did the thing. */
export async function notifyTeam(
  tx: Tx,
  note: { exceptUserId?: string | null; title: string; body?: string; href?: string },
) {
  const recipients = await tx.user.findMany({
    where: { status: UserStatus.ACTIVE, ...(note.exceptUserId ? { id: { not: note.exceptUserId } } : {}) },
    select: { id: true },
  });
  if (recipients.length === 0) return;
  await tx.notification.createMany({
    data: recipients.map((r) => ({ userId: r.id, title: note.title, body: note.body, href: note.href })),
  });
}

const activityInclude = {
  candidate: { select: { id: true, name: true, currentStage: true } },
  actor: { select: { id: true, name: true } },
  job: { select: { id: true, title: true } },
} satisfies Prisma.ActivityInclude;

type ActivityRow = Prisma.ActivityGetPayload<{ include: typeof activityInclude }>;

const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  INITIAL: "Initial",
  TECHNICAL: "Technical",
  HR: "HR",
  PANEL: "Panel",
  HIRING_MANAGER: "Hiring manager",
  OFFER_DISCUSSION: "Offer discussion",
};

function interviewLabel(type: string | undefined): string {
  return (type && INTERVIEW_TYPE_LABELS[type]) || "Interview";
}

/** One plain sentence per event, plus the stage badge the feed shows beside it. */
export function describeActivity(row: ActivityRow): { summary: string; stage: Stage | null } {
  const name = row.candidate?.name ?? "A candidate";
  const meta = (row.metadata ?? {}) as ActivityMetadata;
  const actor = row.actor?.name ?? "Someone";

  switch (row.type) {
    case "CANDIDATE_ADDED":
      return {
        summary: `${name} applied for ${row.job?.title ?? meta.jobTitle ?? "a role"}`,
        stage: Stage.APPLIED,
      };
    case "STAGE_CHANGED": {
      const to = meta.toStage;
      if (to === Stage.OFFER) return { summary: `${name} received an offer`, stage: to };
      if (to === Stage.HIRED) return { summary: `${name} was hired`, stage: to };
      if (to === Stage.REJECTED) return { summary: `${name} was rejected`, stage: to };
      return { summary: `${name} moved to ${to ? STAGE_DISPLAY_NAMES[to] : "a new stage"}`, stage: to ?? null };
    }
    case "NOTE_ADDED":
      return { summary: `${actor} added a note on ${name}`, stage: null };
    case "INTERVIEW_SCHEDULED":
      return { summary: `${interviewLabel(meta.interviewType)} interview scheduled with ${name}`, stage: null };
    case "INTERVIEW_RESCHEDULED":
      return { summary: `${interviewLabel(meta.interviewType)} interview with ${name} was rescheduled`, stage: null };
    case "INTERVIEW_CANCELLED":
      return { summary: `${interviewLabel(meta.interviewType)} interview with ${name} was cancelled`, stage: null };
    case "INTERVIEW_COMPLETED":
      return { summary: `${interviewLabel(meta.interviewType)} interview with ${name} was completed`, stage: null };
  }
}

export function toActivityResponse(row: ActivityRow) {
  const { summary, stage } = describeActivity(row);
  return {
    id: row.id,
    type: row.type,
    summary,
    stage,
    createdAt: row.createdAt.toISOString(),
    candidate: row.candidate ? { id: row.candidate.id, name: row.candidate.name } : null,
    actor: row.actor,
  };
}

export type ActivityQuery = {
  candidateId?: string;
  jobId?: string;
  limit: number;
  /** ISO timestamp: return only events older than this (for "load more"). */
  before?: Date;
};

export async function listActivity(query: ActivityQuery) {
  const rows = await prisma.activity.findMany({
    where: {
      ...(query.candidateId ? { candidateId: query.candidateId } : {}),
      ...(query.jobId ? { jobId: query.jobId } : {}),
      ...(query.before ? { createdAt: { lt: query.before } } : {}),
    },
    include: activityInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
  });
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  return {
    items: page.map(toActivityResponse),
    nextBefore: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
  };
}

export { activityInclude };
