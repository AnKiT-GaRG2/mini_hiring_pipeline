import { EmploymentType, JobStatus, Prisma, Stage, User, WorkMode } from "@prisma/client";
import { prisma } from "../db/prisma";
import { NotFoundError } from "../domain/errors";
import { percentChange, windows } from "../domain/periods";
import type { CreateJobBody, JobSort, UpdateJobBody } from "../validation/job.validation";

const jobInclude = { createdBy: { select: { id: true, name: true } } } satisfies Prisma.JobInclude;
type JobRow = Prisma.JobGetPayload<{ include: typeof jobInclude }>;

const ACTIVE_STAGES: Stage[] = [Stage.APPLIED, Stage.SCREENING, Stage.INTERVIEW, Stage.OFFER];

function emptyCounts(): Record<Stage, number> {
  return Object.fromEntries(Object.values(Stage).map((s) => [s, 0])) as Record<Stage, number>;
}

export function toJobResponse(job: JobRow, counts: Record<Stage, number> = emptyCounts()) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    id: job.id,
    title: job.title,
    department: job.department,
    location: job.location,
    workMode: job.workMode,
    employmentType: job.employmentType,
    status: job.status,
    openings: job.openings,
    description: job.description,
    createdAt: job.createdAt.toISOString(),
    closedAt: job.closedAt?.toISOString() ?? null,
    createdBy: job.createdBy,
    counts,
    total,
    active: ACTIVE_STAGES.reduce((sum, s) => sum + counts[s], 0),
    hired: counts[Stage.HIRED],
  };
}

async function countsByJob(jobIds: string[]): Promise<Map<string, Record<Stage, number>>> {
  const groups = await prisma.candidate.groupBy({
    by: ["jobId", "currentStage"],
    where: { jobId: { in: jobIds } },
    _count: { _all: true },
  });
  const byJob = new Map<string, Record<Stage, number>>();
  for (const g of groups) {
    const counts = byJob.get(g.jobId) ?? emptyCounts();
    counts[g.currentStage] = g._count._all;
    byJob.set(g.jobId, counts);
  }
  return byJob;
}

function sortJobs<T extends { title: string; createdAt: string; total: number }>(jobs: T[], sort: JobSort): T[] {
  const sorted = [...jobs];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "applicants":
      return sorted.sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
    case "title":
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case "recent":
    default:
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export async function listJobs(filter: { status?: JobStatus; q?: string; sort?: JobSort }) {
  const jobs = await prisma.job.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.q
        ? {
            OR: [
              { title: { contains: filter.q, mode: "insensitive" } },
              { department: { contains: filter.q, mode: "insensitive" } },
              { location: { contains: filter.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: jobInclude,
  });
  const counts = await countsByJob(jobs.map((j) => j.id));
  return sortJobs(
    jobs.map((j) => toJobResponse(j, counts.get(j.id))),
    filter.sort ?? "recent",
  );
}

export async function getJob(id: string) {
  const job = await prisma.job.findUnique({ where: { id }, include: jobInclude });
  if (!job) throw new NotFoundError("Job", id);
  const counts = await countsByJob([id]);
  return toJobResponse(job, counts.get(id));
}

export async function createJob(input: CreateJobBody, actor: User) {
  const job = await prisma.job.create({
    data: {
      title: input.title,
      department: input.department ?? null,
      location: input.location ?? null,
      workMode: input.workMode ?? WorkMode.ON_SITE,
      employmentType: input.employmentType ?? EmploymentType.FULL_TIME,
      status: input.status ?? JobStatus.OPEN,
      openings: input.openings ?? 1,
      description: input.description ?? null,
      createdById: actor.id,
      closedAt: input.status === JobStatus.CLOSED ? new Date() : null,
    },
    include: jobInclude,
  });
  return toJobResponse(job);
}

export async function updateJob(id: string, patch: UpdateJobBody) {
  const existing = await prisma.job.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Job", id);

  // closedAt tracks the status: set when a job closes, cleared if it reopens.
  const closedAt =
    patch.status === undefined || patch.status === existing.status
      ? undefined
      : patch.status === JobStatus.CLOSED
        ? new Date()
        : null;

  const job = await prisma.job.update({
    where: { id },
    data: {
      title: patch.title,
      department: patch.department,
      location: patch.location,
      workMode: patch.workMode,
      employmentType: patch.employmentType,
      status: patch.status,
      openings: patch.openings,
      description: patch.description,
      closedAt,
    },
    include: jobInclude,
  });
  const counts = await countsByJob([id]);
  return toJobResponse(job, counts.get(id));
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Average days from application to hire, over the hires made in [from, to). */
async function averageDaysToFill(from: Date, to: Date): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ avg: number | null }[]>`
    SELECT AVG(EXTRACT(EPOCH FROM (h."changedAt" - c."createdAt")) / 86400.0)::float AS avg
    FROM "StageHistory" h
    JOIN "Candidate" c ON c."id" = h."candidateId"
    WHERE h."toStage" = 'HIRED' AND h."changedAt" >= ${from} AND h."changedAt" < ${to}
  `;
  return rows[0]?.avg ?? null;
}

/**
 * The numbers above the jobs list. "Recent" is the last 30 days and the change
 * figures compare it with the 30 days before, so they mean the same thing on
 * any day the page is opened.
 */
export async function getJobsOverview(now: Date = new Date()) {
  const { current, previous } = windows(now, 30);

  const [notClosed, addedRecently, statusGroups, applicantsNow, applicantsBefore, applicantsTotal, hiredTotal, hiresNow, hiresBefore, fillNow, fillBefore, fillAll, perJob] =
    await Promise.all([
      prisma.job.count({ where: { status: { not: JobStatus.CLOSED } } }),
      prisma.job.count({ where: { createdAt: { gte: current.from, lt: current.to } } }),
      prisma.job.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.candidate.count({ where: { createdAt: { gte: current.from, lt: current.to } } }),
      prisma.candidate.count({ where: { createdAt: { gte: previous.from, lt: previous.to } } }),
      prisma.candidate.count(),
      prisma.candidate.count({ where: { currentStage: Stage.HIRED } }),
      prisma.stageHistory.count({ where: { toStage: Stage.HIRED, changedAt: { gte: current.from, lt: current.to } } }),
      prisma.stageHistory.count({ where: { toStage: Stage.HIRED, changedAt: { gte: previous.from, lt: previous.to } } }),
      averageDaysToFill(current.from, current.to),
      averageDaysToFill(previous.from, previous.to),
      averageDaysToFill(new Date(0), new Date(now.getTime() + MS_PER_DAY)),
      prisma.candidate.groupBy({ by: ["jobId"], _count: { _all: true }, orderBy: { _count: { jobId: "desc" } }, take: 5 }),
    ]);

  const statusCounts = { OPEN: 0, PAUSED: 0, CLOSED: 0 } as Record<JobStatus, number>;
  for (const g of statusGroups) statusCounts[g.status] = g._count._all;

  const topJobs = await prisma.job.findMany({
    where: { id: { in: perJob.map((p) => p.jobId) } },
    select: { id: true, title: true },
  });
  const titleById = new Map(topJobs.map((j) => [j.id, j.title]));

  return {
    openings: { value: notClosed, addedRecently },
    applicants: { value: applicantsTotal, changePct: percentChange(applicantsNow, applicantsBefore) },
    hired: { value: hiredTotal, changePct: percentChange(hiresNow, hiresBefore) },
    avgTimeToFill: {
      days: fillAll === null ? null : Math.round(fillAll),
      changePct: fillNow === null || fillBefore === null ? null : percentChange(fillNow, fillBefore),
    },
    statusCounts: { ...statusCounts, total: statusCounts.OPEN + statusCounts.PAUSED + statusCounts.CLOSED },
    topPositions: perJob.map((p) => ({
      id: p.jobId,
      title: titleById.get(p.jobId) ?? "Unknown",
      applicants: p._count._all,
    })),
  };
}
