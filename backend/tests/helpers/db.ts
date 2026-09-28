import { EmploymentType, Job, JobStatus, User, UserRole, WorkMode } from "@prisma/client";
import { prisma } from "../../src/db/prisma";

export const TEST_USER_EMAIL = "manager@example.com";

/**
 * Every application table. TRUNCATE bypasses the StageHistory append-only trigger
 * (which only intercepts UPDATE/DELETE) — that's fine here because this is test
 * infrastructure, not a path the application's own API exposes.
 */
const TABLES = [
  "Notification", "Activity", "InterviewParticipant", "Interview", "Note", "CandidateTag", "Tag",
  "CandidateEducation", "CandidateExperience", "CandidateSkill", "StageHistory", "Candidate", "Job", "User", "Company",
];

export type Baseline = { manager: User; job: Job };
let baseline: Baseline | undefined;

/** The team member and job that resetDatabase() leaves behind. */
export function getBaseline(): Baseline {
  if (!baseline) throw new Error("resetDatabase() has not run yet");
  return baseline;
}

/**
 * Empties the database, then creates the two things nearly every test needs:
 * the team member requests act as (a Hiring Manager) and one open job for
 * candidates to apply to.
 */
export async function resetDatabase(): Promise<Baseline> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  const manager = await createUser({ name: "Test Manager", email: TEST_USER_EMAIL, role: UserRole.HIRING_MANAGER });
  const job = await createJob({ title: "Test Engineer" });
  baseline = { manager, job };
  return baseline;
}

let counter = 0;

export function createUser(input: Partial<Pick<User, "name" | "email" | "role" | "status">> = {}): Promise<User> {
  counter += 1;
  return prisma.user.create({
    data: {
      name: input.name ?? `Member ${counter}`,
      email: input.email ?? `member-${counter}@example.com`,
      role: input.role ?? UserRole.RECRUITER,
      status: input.status ?? "ACTIVE",
    },
  });
}

export function createJob(input: Partial<Pick<Job, "title" | "status" | "workMode" | "employmentType" | "createdAt" | "department">> = {}): Promise<Job> {
  counter += 1;
  return prisma.job.create({
    data: {
      title: input.title ?? `Job ${counter}`,
      department: input.department ?? null,
      status: input.status ?? JobStatus.OPEN,
      workMode: input.workMode ?? WorkMode.REMOTE,
      employmentType: input.employmentType ?? EmploymentType.FULL_TIME,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
  });
}

/** Header that makes a request act as this team member. */
export const asUser = (user: Pick<User, "id">) => ({ "x-user-id": user.id });
