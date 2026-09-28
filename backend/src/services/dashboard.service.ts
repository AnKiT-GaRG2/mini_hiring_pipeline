import { Prisma, Stage } from "@prisma/client";
import { prisma } from "../db/prisma";
import { candidateSummaryInclude, toCandidateResponse } from "../controllers/candidate.presenter";
import { percentChange, windows } from "../domain/periods";

export const PIPELINE_STAGES = [Stage.APPLIED, Stage.SCREENING, Stage.INTERVIEW, Stage.OFFER, Stage.HIRED] as const;

/** How many candidates each board column previews before "View all". */
const COLUMN_PREVIEW = 3;
const SERIES_POINTS = 10;

type Metric = { value: number; changePct: number | null; series: number[] };

/** Number of items at or before `t`; `times` must be sorted ascending. */
function countUpTo(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const inRange = (times: number[], from: number, to: number) => countUpTo(times, to - 1) - countUpTo(times, from - 1);

/**
 * Everything the Home page shows.
 *
 * "In progress" is a *level*: how many candidates are still moving through the
 * pipeline now, compared with the start of the period (its sparkline is the level
 * at the end of each slice). Applicants, hires and rejections are *flows*: how many
 * happened during the period, compared with the same-sized period before it (their
 * sparklines are the count per slice). "Total candidates" shows everyone on file,
 * with the flow of new applicants as its trend.
 *
 * The board is the live pipeline: everyone currently in each stage, however long
 * ago they applied, so nobody who has been stuck for months drops off it.
 */
export async function getDashboard(params: { jobId?: string; days: number }, now: Date = new Date()) {
  const { current, previous } = windows(now, params.days);
  const jobFilter: Prisma.CandidateWhereInput = params.jobId ? { jobId: params.jobId } : {};

  const [applied, closings] = await Promise.all([
    prisma.candidate.findMany({ where: jobFilter, select: { createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.stageHistory.findMany({
      where: { candidate: jobFilter, toStage: { in: [Stage.HIRED, Stage.REJECTED] } },
      select: { toStage: true, changedAt: true },
      orderBy: { changedAt: "asc" },
    }),
  ]);
  const createdAt = applied.map((c) => c.createdAt.getTime());
  const hires = closings.filter((c) => c.toStage === Stage.HIRED).map((c) => c.changedAt.getTime());
  const rejections = closings.filter((c) => c.toStage === Stage.REJECTED).map((c) => c.changedAt.getTime());
  const closed = closings.map((c) => c.changedAt.getTime()).sort((a, b) => a - b);

  const total = (t: number) => countUpTo(createdAt, t);
  const active = (t: number) => total(t) - countUpTo(closed, t);

  const points = Math.min(SERIES_POINTS, params.days);
  const from = current.from.getTime();
  const to = current.to.getTime();
  const slice = (i: number) => from + ((to - from) * i) / points;

  const level = (at: (t: number) => number): Metric => ({
    value: at(to),
    changePct: percentChange(at(to), at(from)),
    series: Array.from({ length: points }, (_, i) => at(slice(i + 1))),
  });
  const flow = (times: number[]): Metric => ({
    value: inRange(times, from, to + 1),
    changePct: percentChange(inRange(times, from, to + 1), inRange(times, previous.from.getTime(), from)),
    series: Array.from({ length: points }, (_, i) => inRange(times, slice(i), i === points - 1 ? to + 1 : slice(i + 1))),
  });

  const [counts, ...columns] = await Promise.all([
    prisma.candidate.groupBy({ by: ["currentStage"], where: jobFilter, _count: { _all: true } }),
    ...PIPELINE_STAGES.map((stage) =>
      prisma.candidate.findMany({
        where: { ...jobFilter, currentStage: stage },
        include: candidateSummaryInclude,
        orderBy: [{ stageEnteredAt: "desc" }, { id: "asc" }],
        take: COLUMN_PREVIEW,
      }),
    ),
  ]);
  const countOf = (stage: Stage) => counts.find((g) => g.currentStage === stage)?._count._all ?? 0;

  return {
    period: { days: params.days, from: current.from.toISOString(), to: current.to.toISOString() },
    stats: {
      // The headline is everyone on file; the trend beside it is how many new applicants arrived.
      total: { ...flow(createdAt), value: total(to) },
      inProgress: level(active),
      hired: flow(hires),
      rejected: flow(rejections),
    },
    pipeline: PIPELINE_STAGES.map((stage, i) => ({
      stage,
      count: countOf(stage),
      candidates: columns[i].map((c) => toCandidateResponse(c, now)),
    })),
    rejectedCount: countOf(Stage.REJECTED),
  };
}
