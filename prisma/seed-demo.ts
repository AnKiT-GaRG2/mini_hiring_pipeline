import {
  ActivityType,
  CandidateSource,
  EmploymentType,
  InterviewStatus,
  InterviewType,
  JobStatus,
  MeetingPlatform,
  PrismaClient,
  Stage,
  UserRole,
  WorkMode,
} from "@prisma/client";
import { validateTransition } from "../backend/src/domain/stageTransitions";

const prisma = new PrismaClient();

const HOUR = 60 * 60 * 1000;
const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * HOUR);
const daysAgo = (d: number) => hoursAgo(d * 24);

const IST_OFFSET_MS = 5.5 * HOUR;

/** A wall-clock time in IST (`dayOffset` days from today, IST) as a UTC instant. */
function istWall(dayOffset: number, hour: number, minute = 0): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + dayOffset, hour, minute) - IST_OFFSET_MS);
}

// ───────────────────────────── team (4) ─────────────────────────────

const TEAM = [
  { name: "Ankit Garg", email: "ankit.garg@example.com", role: UserRole.ADMIN, jobTitle: "Hiring Manager" },
  { name: "Priya Sharma", email: "priya.sharma@example.com", role: UserRole.RECRUITER, jobTitle: "Senior Recruiter" },
  { name: "Rohit Verma", email: "rohit.verma@example.com", role: UserRole.RECRUITER, jobTitle: "Technical Recruiter" },
  { name: "Sneha Iyer", email: "sneha.iyer@example.com", role: UserRole.HIRING_MANAGER, jobTitle: "Engineering Manager" },
] as const;

// ───────────────────────────── jobs (4) ─────────────────────────────

const JOBS = [
  { title: "Frontend Developer", department: "Engineering", location: "Bengaluru, India", workMode: WorkMode.REMOTE, status: JobStatus.OPEN },
  { title: "Backend Developer", department: "Engineering", location: "Hyderabad, India", workMode: WorkMode.REMOTE, status: JobStatus.OPEN },
  { title: "UI/UX Designer", department: "Design", location: "Mumbai, India", workMode: WorkMode.HYBRID, status: JobStatus.OPEN },
  { title: "Product Manager", department: "Product", location: "Mumbai, India", workMode: WorkMode.HYBRID, status: JobStatus.PAUSED },
] as const;
type JobTitle = (typeof JOBS)[number]["title"];

// ───────────────────────────── candidates (9) ─────────────────────────────
// A spread across every stage and job, tuned so the README's example search
// queries ("Priya in Screening for more than 7 days", "sharam", "stuck in
// Screening for more than a week") still find the right people.

type Hop = { stage: Stage; hoursAgo: number };
const d = (days: number) => days * 24;

const CANDIDATES: {
  name: string; email: string; phone?: string; job: JobTitle; skills: string[];
  appliedHoursAgo: number; path: Hop[]; years: number; source: CandidateSource;
}[] = [
  { name: "Priya Sharma", email: "priya.sharma.candidate@example.com", phone: "+91-98765-43210", job: "Frontend Developer", skills: ["React", "TypeScript"], appliedHoursAgo: d(10), path: [{ stage: Stage.SCREENING, hoursAgo: d(8) }], years: 4, source: CandidateSource.LINKEDIN },
  { name: "Rahul Mehta", email: "rahul.mehta@example.com", job: "Frontend Developer", skills: ["JavaScript", "CSS"], appliedHoursAgo: d(2), path: [], years: 2, source: CandidateSource.CAREER_PAGE },
  { name: "Ananya Iyer", email: "ananya.iyer@example.com", phone: "+91-98123-45678", job: "Frontend Developer", skills: ["React", "Next.js"], appliedHoursAgo: d(12), path: [{ stage: Stage.SCREENING, hoursAgo: d(9) }, { stage: Stage.INTERVIEW, hoursAgo: d(2) }], years: 5, source: CandidateSource.REFERRAL },
  { name: "Vikram Nair", email: "vikram.nair@example.com", job: "Backend Developer", skills: ["Node.js", "PostgreSQL"], appliedHoursAgo: d(20), path: [{ stage: Stage.SCREENING, hoursAgo: d(16) }, { stage: Stage.INTERVIEW, hoursAgo: d(9) }, { stage: Stage.OFFER, hoursAgo: d(2) }], years: 6, source: CandidateSource.LINKEDIN },
  { name: "Neha Joshi", email: "neha.joshi@example.com", phone: "+91-96543-21098", job: "Backend Developer", skills: ["Python", "Django"], appliedHoursAgo: d(35), path: [{ stage: Stage.SCREENING, hoursAgo: d(30) }, { stage: Stage.INTERVIEW, hoursAgo: d(22) }, { stage: Stage.OFFER, hoursAgo: d(10) }, { stage: Stage.HIRED, hoursAgo: d(3) }], years: 7, source: CandidateSource.JOB_BOARD },
  { name: "Aditya Verma", email: "aditya.verma@example.com", job: "UI/UX Designer", skills: ["Figma", "Prototyping"], appliedHoursAgo: d(15), path: [{ stage: Stage.SCREENING, hoursAgo: d(11) }, { stage: Stage.REJECTED, hoursAgo: d(6) }], years: 3, source: CandidateSource.AGENCY },
  { name: "Karan Malhotra", email: "karan.malhotra@example.com", job: "UI/UX Designer", skills: ["Sketch", "User Research"], appliedHoursAgo: d(4), path: [{ stage: Stage.SCREENING, hoursAgo: d(3) }], years: 2, source: CandidateSource.CAREER_PAGE },
  { name: "Ritu Singh", email: "ritu.singh@example.com", phone: "+91-95432-10987", job: "Product Manager", skills: ["Roadmapping", "Analytics"], appliedHoursAgo: d(18), path: [{ stage: Stage.SCREENING, hoursAgo: d(14) }, { stage: Stage.INTERVIEW, hoursAgo: d(5) }], years: 5, source: CandidateSource.REFERRAL },
];

// ───────────────────────────── interviews (5) ─────────────────────────────
// A couple already done, a couple today, a couple coming up — so the Calendar
// page has something in every section (today, upcoming, overview).

const INTERVIEWS: {
  candidateEmail: string; day: number; hour: number; minutes: number;
  type: InterviewType; platform: MeetingPlatform; by: string[];
}[] = [
  { candidateEmail: "priya.sharma.candidate@example.com", day: -1, hour: 11, minutes: 30, type: InterviewType.INITIAL, platform: MeetingPlatform.GOOGLE_MEET, by: ["priya.sharma@example.com"] },
  { candidateEmail: "karan.malhotra@example.com", day: 0, hour: 10, minutes: 30, type: InterviewType.HR, platform: MeetingPlatform.ZOOM, by: ["rohit.verma@example.com"] },
  { candidateEmail: "ananya.iyer@example.com", day: 0, hour: 15, minutes: 60, type: InterviewType.PANEL, platform: MeetingPlatform.ZOOM, by: ["ankit.garg@example.com", "sneha.iyer@example.com"] },
  { candidateEmail: "ritu.singh@example.com", day: 1, hour: 14, minutes: 45, type: InterviewType.TECHNICAL, platform: MeetingPlatform.GOOGLE_MEET, by: ["sneha.iyer@example.com"] },
  { candidateEmail: "vikram.nair@example.com", day: 2, hour: 12, minutes: 30, type: InterviewType.OFFER_DISCUSSION, platform: MeetingPlatform.PHONE, by: ["ankit.garg@example.com"] },
];

async function main() {
  await prisma.company.upsert({
    where: { id: "company" },
    update: {},
    create: {
      id: "company",
      name: "Acme Inc.",
      website: "https://acme.com",
      industry: "Technology",
      size: "51–200 employees",
      location: "New Delhi, India",
      description: "We build modern products for a better tomorrow.",
    },
  });

  const users = new Map<string, string>();
  for (const member of TEAM) {
    const user = await prisma.user.upsert({
      where: { email: member.email },
      update: {},
      create: { name: member.name, email: member.email, role: member.role, jobTitle: member.jobTitle },
    });
    users.set(member.email, user.id);
  }
  const ankitId = users.get("ankit.garg@example.com")!;
  const recruiterIds = [users.get("priya.sharma@example.com")!, users.get("rohit.verma@example.com")!];

  const jobs = new Map<JobTitle, string>();
  for (const job of JOBS) {
    let row = await prisma.job.findFirst({ where: { title: job.title } });
    if (!row) {
      row = await prisma.job.create({
        data: {
          title: job.title,
          department: job.department,
          location: job.location,
          workMode: job.workMode,
          employmentType: EmploymentType.FULL_TIME,
          status: job.status,
          openings: 1,
          createdById: ankitId,
        },
      });
    }
    jobs.set(job.title, row.id);
  }

  let created = 0;
  const candidateIds = new Map<string, string>();
  for (const c of CANDIDATES) {
    const existing = await prisma.candidate.findUnique({ where: { email: c.email } });
    if (existing) {
      candidateIds.set(c.email, existing.id);
      continue;
    }

    const appliedAt = hoursAgo(c.appliedHoursAgo);
    let stage: Stage = Stage.APPLIED;
    let stageAt = appliedAt;
    const hops: { from: Stage; to: Stage; at: Date; by: string }[] = [];
    for (const [i, hop] of c.path.entries()) {
      const result = validateTransition(stage, hop.stage);
      if (!result.valid) throw new Error(`Invalid transition for ${c.name}: ${stage} -> ${hop.stage} (${result.reason})`);
      const at = hoursAgo(hop.hoursAgo);
      hops.push({ from: stage, to: hop.stage, at, by: recruiterIds[i % recruiterIds.length] });
      stage = hop.stage;
      stageAt = at;
    }

    const candidate = await prisma.candidate.create({
      data: {
        name: c.name,
        email: c.email,
        phone: c.phone ?? null,
        currentStage: stage,
        stageEnteredAt: stageAt,
        jobId: jobs.get(c.job)!,
        source: c.source,
        yearsOfExperience: c.years,
        summary: `${c.job} candidate with ${c.years} years of experience in ${c.skills.join(", ")}.`,
        createdAt: appliedAt,
        updatedAt: stageAt,
        skills: { create: c.skills.map((name, position) => ({ name, position })) },
      },
    });

    for (const hop of hops) {
      await prisma.stageHistory.create({
        data: { candidateId: candidate.id, fromStage: hop.from, toStage: hop.to, changedAt: hop.at, changedById: hop.by },
      });
    }

    await prisma.activity.create({
      data: { type: ActivityType.CANDIDATE_ADDED, candidateId: candidate.id, jobId: jobs.get(c.job)!, actorId: null, metadata: { jobTitle: c.job }, createdAt: appliedAt },
    });
    for (const hop of hops) {
      await prisma.activity.create({
        data: { type: ActivityType.STAGE_CHANGED, candidateId: candidate.id, jobId: jobs.get(c.job)!, actorId: hop.by, metadata: { fromStage: hop.from, toStage: hop.to }, createdAt: hop.at },
      });
    }

    candidateIds.set(c.email, candidate.id);
    created += 1;
  }

  let interviewsCreated = 0;
  for (const slot of INTERVIEWS) {
    const candidateId = candidateIds.get(slot.candidateEmail);
    if (!candidateId) continue;

    const startsAt = istWall(slot.day, slot.hour, 0);
    if (await prisma.interview.findFirst({ where: { candidateId, startsAt } })) continue;

    const endsAt = new Date(startsAt.getTime() + slot.minutes * 60 * 1000);
    const done = endsAt < now;
    const interviewerIds = slot.by.map((email) => users.get(email)!);

    const interview = await prisma.interview.create({
      data: {
        candidateId,
        type: slot.type,
        startsAt,
        endsAt,
        platform: slot.platform,
        meetingLink: slot.platform === MeetingPlatform.ZOOM ? "https://zoom.us/j/1234567890" : slot.platform === MeetingPlatform.GOOGLE_MEET ? "https://meet.google.com/abc-defg-hij" : null,
        status: done ? InterviewStatus.COMPLETED : InterviewStatus.SCHEDULED,
        createdById: interviewerIds[0],
        createdAt: new Date(Math.min(now.getTime(), startsAt.getTime() - 2 * 24 * HOUR)),
        interviewers: { create: interviewerIds.map((userId) => ({ userId })) },
      },
    });

    await prisma.activity.create({
      data: {
        type: ActivityType.INTERVIEW_SCHEDULED,
        candidateId,
        actorId: interviewerIds[0],
        metadata: { interviewType: slot.type, startsAt: startsAt.toISOString() },
        createdAt: interview.createdAt,
      },
    });

    interviewsCreated += 1;
  }

  console.log(`Seeded ${TEAM.length} team members, ${JOBS.length} jobs, ${created} new candidates (${CANDIDATES.length - created} already existed) and ${interviewsCreated} new interviews.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
