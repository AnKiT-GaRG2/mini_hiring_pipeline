import { ActivityType, Prisma, Stage, User } from "@prisma/client";
import { prisma } from "../db/prisma";
import { validateTransition } from "../domain/stageTransitions";
import {
  CandidateNotFoundError,
  ConflictError,
  DuplicateEmailError,
  InvalidTransitionError,
  NotFoundError,
} from "../domain/errors";
import {
  candidateDetailInclude,
  candidateSummaryInclude,
  CandidateDetailRow,
  CandidateSummaryRow,
} from "../controllers/candidate.presenter";
import type {
  CreateCandidateBody,
  ListCandidatesQuery,
  UpdateCandidateBody,
} from "../validation/candidate.validation";
import { notifyTeam, recordActivity } from "./activity.service";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_CONSTRAINT_VIOLATION;
}

type Actor = Pick<User, "id"> | null | undefined;

function toDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function experienceRows(list: NonNullable<CreateCandidateBody["experiences"]>) {
  return list.map((e) => ({
    title: e.title,
    company: e.company,
    startDate: toDate(e.startDate),
    endDate: e.endDate ? toDate(e.endDate) : null,
    description: e.description ?? null,
  }));
}

function educationRows(list: NonNullable<CreateCandidateBody["education"]>) {
  return list.map((e) => ({
    degree: e.degree,
    fieldOfStudy: e.fieldOfStudy ?? null,
    institution: e.institution,
    startYear: e.startYear ?? null,
    endYear: e.endYear ?? null,
  }));
}

async function requireOpenJob(tx: Prisma.TransactionClient, jobId: string) {
  const job = await tx.job.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError("Job", jobId);
  if (job.status !== "OPEN") {
    throw new ConflictError(`“${job.title}” is ${job.status.toLowerCase()} and isn’t accepting candidates.`);
  }
  return job;
}

export async function createCandidate(input: CreateCandidateBody, actor?: Actor): Promise<CandidateDetailRow> {
  try {
    return await prisma.$transaction(async (tx) => {
      const job = await requireOpenJob(tx, input.jobId);

      const candidate = await tx.candidate.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          jobId: job.id,
          location: input.location ?? null,
          source: input.source,
          yearsOfExperience: input.yearsOfExperience,
          summary: input.summary ?? null,
          githubUrl: input.githubUrl ?? null,
          linkedinUrl: input.linkedinUrl ?? null,
          portfolioUrl: input.portfolioUrl ?? null,
          resumeUrl: input.resumeUrl ?? null,
          skills: { create: (input.skills ?? []).map((name, position) => ({ name, position })) },
          experiences: { create: experienceRows(input.experiences ?? []) },
          education: { create: educationRows(input.education ?? []) },
        },
        include: candidateDetailInclude,
      });

      await recordActivity(tx, {
        type: ActivityType.CANDIDATE_ADDED,
        candidateId: candidate.id,
        jobId: job.id,
        actorId: actor?.id,
        metadata: { jobTitle: job.title },
      });
      await notifyTeam(tx, {
        exceptUserId: actor?.id,
        title: `${candidate.name} applied for ${job.title}`,
        href: `/candidates?open=${candidate.id}`,
      });

      return candidate;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateEmailError(input.email);
    throw err;
  }
}

/**
 * Edits profile fields only. The stage is deliberately not editable here — it
 * changes only through transitionCandidateStage, which is what keeps the audit
 * trail and time-in-stage honest.
 */
export async function updateCandidate(id: string, patch: UpdateCandidateBody): Promise<CandidateDetailRow> {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.candidate.findUnique({ where: { id } });
      if (!existing) throw new CandidateNotFoundError(id);

      if (patch.jobId && patch.jobId !== existing.jobId) await requireOpenJob(tx, patch.jobId);

      await tx.candidate.update({
        where: { id },
        data: {
          name: patch.name,
          email: patch.email,
          phone: patch.phone,
          jobId: patch.jobId,
          location: patch.location,
          source: patch.source,
          yearsOfExperience: patch.yearsOfExperience,
          summary: patch.summary,
          githubUrl: patch.githubUrl,
          linkedinUrl: patch.linkedinUrl,
          portfolioUrl: patch.portfolioUrl,
          resumeUrl: patch.resumeUrl,
        },
      });

      // Lists are replaced wholesale when supplied: the client edits the whole list.
      if (patch.skills) {
        await tx.candidateSkill.deleteMany({ where: { candidateId: id } });
        await tx.candidateSkill.createMany({
          data: patch.skills.map((name, position) => ({ candidateId: id, name, position })),
        });
      }
      if (patch.experiences) {
        await tx.candidateExperience.deleteMany({ where: { candidateId: id } });
        await tx.candidateExperience.createMany({
          data: experienceRows(patch.experiences).map((e) => ({ ...e, candidateId: id })),
        });
      }
      if (patch.education) {
        await tx.candidateEducation.deleteMany({ where: { candidateId: id } });
        await tx.candidateEducation.createMany({
          data: educationRows(patch.education).map((e) => ({ ...e, candidateId: id })),
        });
      }

      return tx.candidate.findUniqueOrThrow({ where: { id }, include: candidateDetailInclude });
    });
  } catch (err) {
    if (isUniqueViolation(err) && patch.email) throw new DuplicateEmailError(patch.email);
    throw err;
  }
}

export async function getCandidateDetail(id: string): Promise<CandidateDetailRow> {
  const candidate = await prisma.candidate.findUnique({ where: { id }, include: candidateDetailInclude });
  if (!candidate) throw new CandidateNotFoundError(id);
  return candidate;
}

// ─────────────────────────────── Listing ───────────────────────────────

// Whole years of experience: fresher < 1, junior 1–2, mid 3–5, senior 6+.
const EXPERIENCE_RANGES: Record<NonNullable<ListCandidatesQuery["experience"]>, Prisma.IntFilter> = {
  fresher: { lt: 1 },
  junior: { gte: 1, lt: 3 },
  mid: { gte: 3, lt: 6 },
  senior: { gte: 6 },
};

export type CandidateFilter = Pick<ListCandidatesQuery, "q" | "jobId" | "stage" | "experience" | "tagId" | "ids">;

function buildWhere(filter: CandidateFilter): Prisma.CandidateWhereInput {
  const and: Prisma.CandidateWhereInput[] = [];

  if (filter.q) {
    const contains = { contains: filter.q, mode: "insensitive" as const };
    and.push({ OR: [{ name: contains }, { email: contains }, { skills: { some: { name: contains } } }] });
  }
  if (filter.jobId) and.push({ jobId: filter.jobId });
  if (filter.stage) and.push({ currentStage: filter.stage });
  if (filter.experience) and.push({ yearsOfExperience: EXPERIENCE_RANGES[filter.experience] });
  if (filter.tagId) and.push({ tags: { some: { tagId: filter.tagId } } });
  if (filter.ids) and.push({ id: { in: filter.ids } });

  return and.length > 0 ? { AND: and } : {};
}

function buildOrderBy(sort: ListCandidatesQuery["sort"]): Prisma.CandidateOrderByWithRelationInput[] {
  // `id` is always the last key so paging is stable when the main key ties.
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "name":
      return [{ name: "asc" }, { id: "asc" }];
    case "stage":
      return [{ currentStage: "asc" }, { stageEnteredAt: "asc" }, { id: "asc" }];
    case "longest-in-stage":
      return [{ stageEnteredAt: "asc" }, { id: "asc" }];
    case "latest":
    default:
      return [{ createdAt: "desc" }, { id: "asc" }];
  }
}

export async function listCandidates(query: ListCandidatesQuery) {
  const where = buildWhere(query);
  const [total, items] = await Promise.all([
    prisma.candidate.count({ where }),
    prisma.candidate.findMany({
      where,
      include: candidateSummaryInclude,
      orderBy: buildOrderBy(query.sort),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

/** Everything matching the filter, unpaged — for exports. */
export function findAllCandidates(filter: CandidateFilter & { sort: ListCandidatesQuery["sort"] }): Promise<CandidateSummaryRow[]> {
  return prisma.candidate.findMany({
    where: buildWhere(filter),
    include: candidateSummaryInclude,
    orderBy: buildOrderBy(filter.sort),
  });
}

export async function getStageCounts(jobId?: string): Promise<Record<Stage, number>> {
  const groups = await prisma.candidate.groupBy({
    by: ["currentStage"],
    where: jobId ? { jobId } : undefined,
    _count: { _all: true },
  });
  const counts = Object.fromEntries(Object.values(Stage).map((s) => [s, 0])) as Record<Stage, number>;
  for (const g of groups) counts[g.currentStage] = g._count._all;
  return counts;
}

export async function getCandidateHistory(candidateId: string) {
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { id: true } });
  if (!candidate) throw new CandidateNotFoundError(candidateId);

  return prisma.stageHistory.findMany({
    where: { candidateId },
    include: { changedBy: { select: { id: true, name: true } } },
    orderBy: { changedAt: "asc" },
  });
}

// ───────────────────────────── Transitions ─────────────────────────────

const NOTIFY_ON: Partial<Record<Stage, (name: string) => string>> = {
  [Stage.OFFER]: (name) => `${name} received an offer`,
  [Stage.HIRED]: (name) => `${name} was hired`,
  [Stage.REJECTED]: (name) => `${name} was rejected`,
};

/**
 * Moves a candidate to `toStage`, validating the transition and recording an
 * immutable StageHistory row (plus a feed entry) in one database transaction.
 *
 * The timestamp is always taken server-side (`new Date()`), never accepted
 * from a caller — a future HTTP layer must not be able to backdate audit
 * history through this entrypoint. Seed data, which legitimately needs
 * historical timestamps, writes directly via Prisma instead of through this
 * service (see prisma/seed.ts).
 */
export async function transitionCandidateStage(
  candidateId: string,
  toStage: Stage,
  actor?: Actor,
): Promise<CandidateSummaryRow> {
  return prisma.$transaction(async (tx) => {
    // Lock the row before reading it. A transaction makes the two writes atomic, but on its own
    // it doesn't stop two requests validating against the same stale read (both see "Applied",
    // one rejects, one advances, and a rejected candidate ends up in Screening). With the lock,
    // the second request waits, then reads the state the first one committed and is judged
    // against that — so it gets the correct "final stage" / "already in stage" error.
    await tx.$queryRaw`SELECT "id" FROM "Candidate" WHERE "id" = ${candidateId} FOR UPDATE`;

    const candidate = await tx.candidate.findUnique({ where: { id: candidateId } });

    if (!candidate) {
      throw new CandidateNotFoundError(candidateId);
    }

    const result = validateTransition(candidate.currentStage, toStage);

    if (!result.valid) {
      throw new InvalidTransitionError(candidate.currentStage, toStage, result.reason);
    }

    const changedAt = new Date();

    const updated = await tx.candidate.update({
      where: { id: candidateId },
      data: { currentStage: toStage, stageEnteredAt: changedAt },
      include: candidateSummaryInclude,
    });

    await tx.stageHistory.create({
      data: {
        candidateId,
        fromStage: candidate.currentStage,
        toStage,
        changedAt,
        changedById: actor?.id ?? null,
      },
    });

    await recordActivity(tx, {
      type: ActivityType.STAGE_CHANGED,
      candidateId,
      jobId: candidate.jobId,
      actorId: actor?.id,
      metadata: { fromStage: candidate.currentStage, toStage },
      at: changedAt,
    });

    const title = NOTIFY_ON[toStage]?.(candidate.name);
    if (title) {
      await notifyTeam(tx, { exceptUserId: actor?.id, title, href: `/candidates?open=${candidateId}` });
    }

    return updated;
  });
}
