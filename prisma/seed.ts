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
import { STAGE_DISPLAY_NAMES } from "../backend/src/search/stageWords";

const prisma = new PrismaClient();

// ──────────────────────────── time helpers ────────────────────────────

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

// A small deterministic PRNG: the generated candidates are the same on every run.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260928);
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
const sample = <T>(list: readonly T[], n: number): T[] => {
  const copy = [...list];
  const out: T[] = [];
  while (out.length < n && copy.length > 0) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
};

// ───────────────────────────── the team ─────────────────────────────

const TEAM = [
  { key: "ankit", name: "Ankit Garg", email: "ankit.garg@example.com", role: UserRole.HIRING_MANAGER, jobTitle: "Hiring Manager", joined: "2024-04-08" },
  { key: "priya", name: "Priya Sharma", email: "priya.sharma@example.com", role: UserRole.RECRUITER, jobTitle: "Senior Recruiter", joined: "2024-05-13" },
  { key: "rohit", name: "Rohit Verma", email: "rohit.verma@example.com", role: UserRole.RECRUITER, jobTitle: "Technical Recruiter", joined: "2024-06-03" },
  { key: "sneha", name: "Sneha Iyer", email: "sneha.iyer@example.com", role: UserRole.RECRUITER, jobTitle: "Recruiter", joined: "2024-06-24" },
  { key: "amit", name: "Amit Kumar", email: "amit.kumar@example.com", role: UserRole.ADMIN, jobTitle: "People Operations", joined: "2024-03-18" },
] as const;
type TeamKey = (typeof TEAM)[number]["key"];

// ───────────────────────────── the jobs ─────────────────────────────

type JobKey = "frontend" | "backend" | "design" | "product" | "devops";

const JOBS: {
  key: JobKey;
  title: string;
  department: string;
  location: string;
  workMode: WorkMode;
  status: JobStatus;
  ageDays: number;
  /** How likely a generated candidate is to apply here. */
  weight: number;
  description: string;
  skills: string[];
  titles: string[];
}[] = [
  {
    key: "frontend",
    title: "Frontend Developer",
    department: "Engineering",
    location: "Bengaluru, India",
    workMode: WorkMode.REMOTE,
    status: JobStatus.OPEN,
    ageDays: 25,
    weight: 3,
    description: "Build and maintain modern web applications using React, TypeScript and a component-driven design system.",
    skills: ["React", "TypeScript", "JavaScript", "CSS", "Next.js", "Tailwind", "Vue.js", "HTML", "Redux", "GraphQL"],
    titles: ["Frontend Engineer", "UI Developer", "Web Developer"],
  },
  {
    key: "backend",
    title: "Backend Developer",
    department: "Engineering",
    location: "Hyderabad, India",
    workMode: WorkMode.REMOTE,
    status: JobStatus.OPEN,
    ageDays: 140,
    weight: 3,
    description: "Design and develop scalable backend services and APIs.",
    skills: ["Node.js", "Python", "Django", "Express", "PostgreSQL", "Go", "Java", "Redis", "Docker", "REST"],
    titles: ["Backend Engineer", "Software Engineer", "API Developer"],
  },
  {
    key: "design",
    title: "UI/UX Designer",
    department: "Design",
    location: "New Delhi, India",
    workMode: WorkMode.ON_SITE,
    status: JobStatus.OPEN,
    ageDays: 150,
    weight: 2,
    description: "Create intuitive and beautiful user experiences.",
    skills: ["Figma", "Prototyping", "User Research", "Design Systems", "Sketch", "Illustration", "Wireframing"],
    titles: ["Product Designer", "UX Designer", "Visual Designer"],
  },
  {
    key: "product",
    title: "Product Manager",
    department: "Product",
    location: "Mumbai, India",
    workMode: WorkMode.HYBRID,
    status: JobStatus.PAUSED,
    ageDays: 160,
    weight: 1.5,
    description: "Lead product development and work with cross-functional teams to ship products customers love.",
    skills: ["Roadmapping", "Agile", "Analytics", "SQL", "Stakeholder Management", "User Stories", "Jira"],
    titles: ["Associate Product Manager", "Product Analyst", "Business Analyst"],
  },
  {
    key: "devops",
    title: "DevOps Engineer",
    department: "Engineering",
    location: "Pune, India",
    workMode: WorkMode.REMOTE,
    status: JobStatus.OPEN,
    ageDays: 170,
    weight: 1.5,
    description: "Manage infrastructure, CI/CD and cloud environments.",
    skills: ["AWS", "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux", "Jenkins", "Prometheus"],
    titles: ["Site Reliability Engineer", "Cloud Engineer", "Systems Engineer"],
  },
];
const jobAge = (key: JobKey) => JOBS.find((j) => j.key === key)!.ageDays;

// ───────────────────────────── candidates ─────────────────────────────

type Hop = { stage: Stage; hoursAgo: number };

type CandidateSeed = {
  name: string;
  email: string;
  phone?: string;
  job: JobKey;
  skills: string[];
  appliedHoursAgo: number;
  path: Hop[];
  years?: number;
};

const d = (days: number) => days * 24;

// The original demo candidates keep their timelines, so the README's example
// queries ("stuck in Screening for more than a week" …) still find the same people.
const NAMED: CandidateSeed[] = [
  { name: "Priya Sharma", email: "priya.sharma@example.com", phone: "+91-98765-43210", job: "frontend", skills: ["React", "Node.js", "TypeScript"], appliedHoursAgo: d(2), path: [] },
  { name: "Rahul Mehta", email: "rahul.mehta@example.com", job: "frontend", skills: ["JavaScript", "CSS", "React"], appliedHoursAgo: d(10), path: [{ stage: Stage.SCREENING, hoursAgo: d(8) }] },
  { name: "Ananya Iyer", email: "ananya.iyer@example.com", phone: "+91-98123-45678", job: "frontend", skills: ["React", "Node.js"], appliedHoursAgo: d(5), path: [{ stage: Stage.SCREENING, hoursAgo: d(2) }] },
  {
    name: "Vikram Nair", email: "vikram.nair@example.com", job: "frontend", skills: ["Python", "Django", "React"], appliedHoursAgo: d(20),
    path: [{ stage: Stage.SCREENING, hoursAgo: d(15) }, { stage: Stage.INTERVIEW, hoursAgo: d(3) }],
  },
  {
    name: "Sneha Reddy", email: "sneha.reddy@example.com", phone: "+91-99887-66554", job: "backend", skills: ["Python", "Django", "PostgreSQL"], appliedHoursAgo: d(25),
    path: [{ stage: Stage.SCREENING, hoursAgo: d(18) }, { stage: Stage.INTERVIEW, hoursAgo: d(10) }],
  },
  {
    name: "Arjun Kapoor", email: "arjun.kapoor@example.com", job: "backend", skills: ["React", "Node.js", "Express"], appliedHoursAgo: d(30),
    path: [{ stage: Stage.SCREENING, hoursAgo: d(25) }, { stage: Stage.INTERVIEW, hoursAgo: d(15) }, { stage: Stage.OFFER, hoursAgo: d(4) }],
  },
  {
    name: "Divya Menon", email: "divya.menon@example.com", phone: "+91-97654-32109", job: "design", skills: ["Figma", "Prototyping", "Design Systems"], appliedHoursAgo: d(35),
    path: [{ stage: Stage.SCREENING, hoursAgo: d(28) }, { stage: Stage.INTERVIEW, hoursAgo: d(20) }, { stage: Stage.OFFER, hoursAgo: d(1) }],
  },
  {
    name: "Karan Malhotra", email: "karan.malhotra@example.com", job: "backend", skills: ["TypeScript", "Next.js", "Node.js"], appliedHoursAgo: d(44),
    path: [{ stage: Stage.SCREENING, hoursAgo: d(40) }, { stage: Stage.INTERVIEW, hoursAgo: d(30) }, { stage: Stage.OFFER, hoursAgo: d(10) }, { stage: Stage.HIRED, hoursAgo: d(2) }],
  },
  {
    name: "Neha Joshi", email: "neha.joshi@example.com", phone: "+91-96543-21098", job: "devops", skills: ["AWS", "Docker", "Kubernetes"], appliedHoursAgo: d(50),
    path: [{ stage: Stage.SCREENING, hoursAgo: d(45) }, { stage: Stage.INTERVIEW, hoursAgo: d(35) }, { stage: Stage.OFFER, hoursAgo: d(15) }, { stage: Stage.HIRED, hoursAgo: d(10) }],
  },
  { name: "Aditya Verma", email: "aditya.verma@example.com", job: "backend", skills: ["Python", "Django"], appliedHoursAgo: d(12), path: [{ stage: Stage.REJECTED, hoursAgo: d(9) }] },
  {
    name: "Ritu Singh", email: "ritu.singh@example.com", phone: "+91-95432-10987", job: "product", skills: ["Roadmapping", "Analytics", "Agile"], appliedHoursAgo: d(40),
    path: [{ stage: Stage.SCREENING, hoursAgo: d(35) }, { stage: Stage.INTERVIEW, hoursAgo: d(25) }, { stage: Stage.OFFER, hoursAgo: d(10) }, { stage: Stage.REJECTED, hoursAgo: d(8) }],
  },
  { name: "Manish Kumar", email: "manish.kumar@example.com", job: "devops", skills: ["JavaScript", "Docker"], appliedHoursAgo: d(6), path: [{ stage: Stage.REJECTED, hoursAgo: d(5) }] },
];

const FIRST_NAMES = [
  "Aarav", "Aditi", "Akash", "Alisha", "Amrita", "Anil", "Anjali", "Ashwin", "Bhavna", "Chetan", "Deepak", "Devika", "Farhan", "Gauri", "Harsh",
  "Isha", "Jatin", "Kavya", "Kunal", "Lakshmi", "Mohit", "Nikhil", "Nisha", "Omkar", "Pallavi", "Pranav", "Rachana", "Rohan", "Saurabh", "Shreya",
  "Siddharth", "Tanvi", "Tarun", "Uday", "Varun", "Vidya", "Yash", "Zoya", "Ishaan", "Meera", "Naveen", "Ojas", "Radhika", "Suresh",
];
const LAST_NAMES = [
  "Agarwal", "Bhat", "Chopra", "Desai", "Fernandes", "Gupta", "Hegde", "Iyer", "Jain", "Khanna", "Kulkarni", "Mishra", "Nambiar", "Pillai", "Rao",
  "Saxena", "Trivedi", "Wagh", "Yadav", "Bose", "Chatterjee", "Dutta", "Ghosh", "Mukherjee", "Sinha", "Menon", "Reddy", "Shetty", "Thakur", "Sethi",
];

// How many candidates end up in each final stage, and how long they have been there (days).
// Most people who applied months ago have long since been hired or rejected, which is what
// keeps the month-on-month figures on the dashboard believable.
const GENERATED: { stage: Stage; count: number; sinceDays: [number, number] }[] = [
  { stage: Stage.APPLIED, count: 15, sinceDays: [0.1, 16] },
  { stage: Stage.SCREENING, count: 9, sinceDays: [0.3, 20] },
  { stage: Stage.INTERVIEW, count: 7, sinceDays: [0.3, 14] },
  { stage: Stage.OFFER, count: 3, sinceDays: [0.3, 10] },
  { stage: Stage.HIRED, count: 24, sinceDays: [1, 115] },
  { stage: Stage.REJECTED, count: 110, sinceDays: [1, 115] },
];

// Days a candidate typically spends in a stage before moving on.
const STAY_DAYS: Partial<Record<Stage, [number, number]>> = {
  [Stage.APPLIED]: [1, 6],
  [Stage.SCREENING]: [2, 9],
  [Stage.INTERVIEW]: [4, 14],
  [Stage.OFFER]: [1, 6],
};
const stay = (stage: Stage) => between(...STAY_DAYS[stage]!);

const FORWARD: Stage[] = [Stage.SCREENING, Stage.INTERVIEW, Stage.OFFER, Stage.HIRED];

/** The stages visited after APPLIED, ending at `final`. */
function visitedStages(final: Stage): Stage[] {
  if (final === Stage.APPLIED) return [];
  if (final === Stage.REJECTED) return [...FORWARD.slice(0, pick([0, 1, 2])), Stage.REJECTED];
  return FORWARD.slice(0, FORWARD.indexOf(final) + 1);
}

function generateCandidates(): CandidateSeed[] {
  const takenNames = new Set(NAMED.map((c) => c.name));
  const takenEmails = new Set(NAMED.map((c) => c.email));
  const weighted = JOBS.flatMap((j) => Array<typeof j>(Math.round(j.weight * 2)).fill(j));
  const out: CandidateSeed[] = [];

  for (const group of GENERATED) {
    for (let i = 0; i < group.count; i++) {
      let name = "";
      do name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      while (takenNames.has(name));
      takenNames.add(name);

      let email = `${name.toLowerCase().replace(" ", ".")}@example.com`;
      for (let n = 2; takenEmails.has(email); n++) email = `${name.toLowerCase().replace(" ", ".")}${n}@example.com`;
      takenEmails.add(email);

      // Work backwards from the last move: each earlier move happened one stay before the next.
      const stages = visitedStages(group.stage);
      const daysAgoOfMove: number[] = new Array(stages.length);
      let at = between(...group.sinceDays);
      const appliedDays =
        stages.length === 0
          ? at
          : (() => {
              daysAgoOfMove[stages.length - 1] = at;
              for (let k = stages.length - 2; k >= 0; k--) {
                at += stay(stages[k]);
                daysAgoOfMove[k] = at;
              }
              return at + stay(Stage.APPLIED);
            })();

      // Only jobs that were already open when this person applied.
      const job = pick(weighted.filter((j) => j.ageDays > appliedDays + 0.5));

      out.push({
        name,
        email,
        phone: rand() < 0.6 ? `+91-9${int(1000, 9999)}-${int(10000, 99999)}` : undefined,
        job: job.key,
        skills: sample(job.skills, int(2, 4)),
        appliedHoursAgo: appliedDays * 24,
        path: stages.map((stage, k) => ({ stage, hoursAgo: daysAgoOfMove[k] * 24 })),
      });
    }
  }
  return out;
}

const LOCATIONS = ["Bengaluru, India", "Mumbai, India", "New Delhi, India", "Hyderabad, India", "Pune, India", "Chennai, India", "Gurugram, India", "Remote"];
const COMPANIES = ["Zenith Labs", "Northwind Tech", "Bluepeak Systems", "Orbit Digital", "Quantum Retail", "Lumen Analytics", "Cobalt Software", "Sapphire Cloud"];
const INSTITUTIONS = ["IIT Delhi", "BITS Pilani", "NIT Trichy", "VIT Vellore", "Delhi Technological University", "IIIT Hyderabad", "Anna University", "Pune University"];
const DEGREES: Record<JobKey, [string, string]> = {
  frontend: ["B.Tech", "Computer Science"],
  backend: ["B.Tech", "Information Technology"],
  design: ["B.Des", "Interaction Design"],
  product: ["MBA", "Business Management"],
  devops: ["B.Tech", "Computer Engineering"],
};
const SOURCES: CandidateSource[] = [
  CandidateSource.LINKEDIN, CandidateSource.LINKEDIN, CandidateSource.REFERRAL, CandidateSource.CAREER_PAGE,
  CandidateSource.CAREER_PAGE, CandidateSource.JOB_BOARD, CandidateSource.AGENCY,
];

const TAGS = [
  { name: "High potential", color: "violet" },
  { name: "Referral", color: "green" },
  { name: "Needs follow-up", color: "amber" },
  { name: "Strong portfolio", color: "blue" },
  { name: "Remote only", color: "slate" },
];

// ───────────────────────────── interviews ─────────────────────────────

type Slot = {
  day: number;
  hour: number;
  minute?: number;
  minutes: number;
  type: InterviewType;
  platform: MeetingPlatform;
  by: TeamKey[];
};

// A busy current week, a lighter next one, and a couple already done.
const SLOTS: Slot[] = [
  { day: -2, hour: 15, minutes: 45, type: InterviewType.TECHNICAL, platform: MeetingPlatform.ZOOM, by: ["rohit"] },
  { day: -1, hour: 11, minutes: 45, type: InterviewType.HR, platform: MeetingPlatform.GOOGLE_MEET, by: ["sneha"] },
  { day: -1, hour: 16, minutes: 60, type: InterviewType.PANEL, platform: MeetingPlatform.ZOOM, by: ["ankit", "priya"] },
  { day: 0, hour: 9, minutes: 45, type: InterviewType.INITIAL, platform: MeetingPlatform.ZOOM, by: ["priya"] },
  { day: 0, hour: 11, minutes: 45, type: InterviewType.TECHNICAL, platform: MeetingPlatform.GOOGLE_MEET, by: ["rohit"] },
  { day: 0, hour: 11, minutes: 60, type: InterviewType.PANEL, platform: MeetingPlatform.ZOOM, by: ["ankit", "sneha"] },
  { day: 0, hour: 14, minutes: 60, type: InterviewType.PANEL, platform: MeetingPlatform.GOOGLE_MEET, by: ["ankit", "priya"] },
  { day: 1, hour: 10, minutes: 60, type: InterviewType.PANEL, platform: MeetingPlatform.ON_SITE, by: ["ankit", "rohit"] },
  { day: 1, hour: 13, minutes: 60, type: InterviewType.TECHNICAL, platform: MeetingPlatform.ZOOM, by: ["sneha"] },
  { day: 1, hour: 15, minutes: 45, type: InterviewType.HR, platform: MeetingPlatform.GOOGLE_MEET, by: ["priya"] },
  { day: 2, hour: 11, minutes: 60, type: InterviewType.OFFER_DISCUSSION, platform: MeetingPlatform.PHONE, by: ["ankit"] },
  { day: 2, hour: 10, minutes: 45, type: InterviewType.INITIAL, platform: MeetingPlatform.ZOOM, by: ["priya"] },
  { day: 3, hour: 10, minutes: 45, type: InterviewType.INITIAL, platform: MeetingPlatform.GOOGLE_MEET, by: ["sneha"] },
  { day: 3, hour: 14, minutes: 60, type: InterviewType.PANEL, platform: MeetingPlatform.ZOOM, by: ["ankit", "rohit"] },
  { day: 4, hour: 13, minutes: 45, type: InterviewType.HR, platform: MeetingPlatform.ON_SITE, by: ["priya"] },
  { day: 4, hour: 16, minutes: 60, type: InterviewType.TECHNICAL, platform: MeetingPlatform.GOOGLE_MEET, by: ["rohit"] },
  { day: 5, hour: 12, minutes: 45, type: InterviewType.HIRING_MANAGER, platform: MeetingPlatform.ZOOM, by: ["ankit"] },
  { day: 6, hour: 10, minutes: 45, type: InterviewType.TECHNICAL, platform: MeetingPlatform.GOOGLE_MEET, by: ["sneha"] },
  { day: 7, hour: 11, minutes: 60, type: InterviewType.OFFER_DISCUSSION, platform: MeetingPlatform.PHONE, by: ["ankit"] },
  { day: 8, hour: 15, minutes: 45, type: InterviewType.INITIAL, platform: MeetingPlatform.ZOOM, by: ["priya"] },
];

// Which pipeline stages each interview type makes sense for.
const TYPE_STAGES: Record<InterviewType, Stage[]> = {
  [InterviewType.INITIAL]: [Stage.APPLIED, Stage.SCREENING],
  [InterviewType.HR]: [Stage.SCREENING, Stage.INTERVIEW],
  [InterviewType.TECHNICAL]: [Stage.SCREENING, Stage.INTERVIEW],
  [InterviewType.PANEL]: [Stage.INTERVIEW],
  [InterviewType.HIRING_MANAGER]: [Stage.INTERVIEW, Stage.OFFER],
  [InterviewType.OFFER_DISCUSSION]: [Stage.OFFER],
};

// ───────────────────────────────── main ─────────────────────────────────

const NOTE_BODIES = [
  "Strong communicator. Walked through a past project clearly and asked good questions about the team.",
  "Salary expectation is at the top of our band. Worth discussing before the next round.",
  "Available to join within 30 days. Currently serving a notice period.",
  "Portfolio is impressive, especially the design-system work. Recommend fast-tracking.",
  "Needs a follow-up on system design. Solid fundamentals but limited experience at scale.",
  "Referred by an existing team member. Culture fit looks great.",
];

async function main() {
  // Seeding writes backdated rows directly with Prisma, bypassing the services on purpose
  // (they never accept timestamps). TRUNCATE also bypasses the append-only trigger on
  // StageHistory, which only blocks UPDATE/DELETE — a deliberate dev reset, not something
  // the API can do.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Notification", "Activity", "InterviewParticipant", "Interview", "Note", "CandidateTag", "Tag", ' +
      '"CandidateEducation", "CandidateExperience", "CandidateSkill", "StageHistory", "Candidate", "Job", "User", "Company" RESTART IDENTITY CASCADE',
  );

  await prisma.company.create({
    data: {
      name: "Acme Inc.",
      website: "https://acme.com",
      industry: "Technology",
      size: "51–200 employees",
      location: "New Delhi, India",
      description: "We build modern products for a better tomorrow. Our mission is to create technology that empowers people and businesses to achieve more.",
    },
  });

  const users = new Map<TeamKey, string>();
  for (const member of TEAM) {
    const user = await prisma.user.create({
      data: {
        name: member.name,
        email: member.email,
        role: member.role,
        jobTitle: member.jobTitle,
        joinedAt: new Date(`${member.joined}T09:00:00Z`),
        createdAt: new Date(`${member.joined}T09:00:00Z`),
      },
    });
    users.set(member.key, user.id);
  }
  const userId = (key: TeamKey) => users.get(key)!;
  const recruiters: TeamKey[] = ["priya", "rohit", "sneha", "ankit"];

  const jobs = new Map<JobKey, { id: string; title: string }>();
  for (const job of JOBS) {
    const created = await prisma.job.create({
      data: {
        title: job.title,
        department: job.department,
        location: job.location,
        workMode: job.workMode,
        employmentType: EmploymentType.FULL_TIME,
        status: job.status,
        openings: 1,
        description: job.description,
        createdById: userId("ankit"),
        createdAt: daysAgo(job.ageDays),
      },
    });
    jobs.set(job.key, { id: created.id, title: created.title });
  }

  const tags = new Map<string, string>();
  for (const tag of TAGS) tags.set(tag.name, (await prisma.tag.create({ data: tag })).id);

  const seeds = [...NAMED, ...generateCandidates()];
  const created: { id: string; seed: CandidateSeed; stage: Stage; stageAt: Date }[] = [];

  for (const seed of seeds) {
    const job = jobs.get(seed.job)!;
    const jobDef = JOBS.find((j) => j.key === seed.job)!;
    const appliedAt = hoursAgo(seed.appliedHoursAgo);
    const years = seed.years ?? int(1, 9);
    const [degree, field] = DEGREES[seed.job];

    let stage: Stage = Stage.APPLIED;
    let stageAt = appliedAt;
    const hops: { from: Stage; to: Stage; at: Date; by: TeamKey }[] = [];
    for (const hop of seed.path) {
      // Same rules the live transition service enforces, so seed data can never encode an invalid sequence.
      const result = validateTransition(stage, hop.stage);
      if (!result.valid) throw new Error(`Seed data for ${seed.name} has an invalid transition ${stage} -> ${hop.stage}: ${result.reason}`);
      const at = hoursAgo(hop.hoursAgo);
      if (at < stageAt) throw new Error(`Seed data for ${seed.name} moves to ${hop.stage} before ${stage}`);
      hops.push({ from: stage, to: hop.stage, at, by: pick(recruiters) });
      stage = hop.stage;
      stageAt = at;
    }

    const skillList = seed.skills;
    const candidate = await prisma.candidate.create({
      data: {
        name: seed.name,
        email: seed.email,
        phone: seed.phone ?? null,
        currentStage: stage,
        stageEnteredAt: stageAt,
        jobId: job.id,
        location: pick(LOCATIONS),
        source: pick(SOURCES),
        yearsOfExperience: years,
        summary: `${jobDef.titles[0]} with ${years} year${years === 1 ? "" : "s"} of experience in ${skillList.slice(0, 3).join(", ")}. Applying for ${job.title}.`,
        linkedinUrl: rand() < 0.7 ? `https://linkedin.com/in/${seed.name.toLowerCase().replace(/\s+/g, "-")}` : null,
        githubUrl: seed.job === "design" || seed.job === "product" ? null : rand() < 0.6 ? `https://github.com/${seed.name.toLowerCase().replace(/\s+/g, "")}` : null,
        createdAt: appliedAt,
        updatedAt: stageAt,
        skills: { create: skillList.map((name, position) => ({ name, position })) },
        experiences: {
          create: [
            {
              title: pick(jobDef.titles),
              company: pick(COMPANIES),
              startDate: new Date(Date.UTC(now.getUTCFullYear() - Math.max(1, Math.min(years, 3)), int(0, 11), 1)),
              endDate: null,
              description: `Working on ${skillList[0]} projects with a small cross-functional team.`,
            },
          ],
        },
        education: { create: [{ degree, fieldOfStudy: field, institution: pick(INSTITUTIONS), startYear: now.getUTCFullYear() - years - 4, endYear: now.getUTCFullYear() - years }] },
      },
    });

    for (const hop of hops) {
      await prisma.stageHistory.create({
        data: { candidateId: candidate.id, fromStage: hop.from, toStage: hop.to, changedAt: hop.at, changedById: userId(hop.by) },
      });
    }

    // The feed is derived from the same timeline, so the two can never disagree.
    await prisma.activity.create({
      data: { type: ActivityType.CANDIDATE_ADDED, candidateId: candidate.id, jobId: job.id, actorId: null, metadata: { jobTitle: job.title }, createdAt: appliedAt },
    });
    for (const hop of hops) {
      await prisma.activity.create({
        data: {
          type: ActivityType.STAGE_CHANGED,
          candidateId: candidate.id,
          jobId: job.id,
          actorId: userId(hop.by),
          metadata: { fromStage: hop.from, toStage: hop.to },
          createdAt: hop.at,
        },
      });
    }

    created.push({ id: candidate.id, seed, stage, stageAt });
  }

  // Tags on a handful of candidates, and a few notes.
  const tagNames = TAGS.map((t) => t.name);
  for (const c of sample(created, 16)) {
    for (const name of sample(tagNames, int(1, 2))) {
      await prisma.candidateTag.create({ data: { candidateId: c.id, tagId: tags.get(name)! } });
    }
  }
  const notable = created.filter((c) => c.stage !== Stage.APPLIED && c.stage !== Stage.REJECTED);
  for (const [i, c] of sample(notable, NOTE_BODIES.length).entries()) {
    const author = pick(recruiters);
    const createdAt = new Date(Math.max(c.stageAt.getTime(), now.getTime() - between(1, 6) * 24 * HOUR));
    await prisma.note.create({ data: { candidateId: c.id, authorId: userId(author), body: NOTE_BODIES[i], createdAt } });
    await prisma.activity.create({
      data: { type: ActivityType.NOTE_ADDED, candidateId: c.id, jobId: jobs.get(c.seed.job)!.id, actorId: userId(author), createdAt },
    });
  }

  // Interviews: hand each slot to a candidate at a suitable stage, each used once.
  const used = new Set<string>();
  let interviews = 0;
  for (const slot of SLOTS) {
    const candidate = created.find((c) => !used.has(c.id) && TYPE_STAGES[slot.type].includes(c.stage));
    if (!candidate) continue;
    used.add(candidate.id);

    const startsAt = istWall(slot.day, slot.hour, slot.minute ?? 0);
    const endsAt = new Date(startsAt.getTime() + slot.minutes * 60 * 1000);
    const done = endsAt < now;
    const interview = await prisma.interview.create({
      data: {
        candidateId: candidate.id,
        type: slot.type,
        startsAt,
        endsAt,
        platform: slot.platform,
        meetingLink: slot.platform === MeetingPlatform.ZOOM ? "https://zoom.us/j/1234567890" : slot.platform === MeetingPlatform.GOOGLE_MEET ? "https://meet.google.com/abc-defg-hij" : null,
        location: slot.platform === MeetingPlatform.ON_SITE ? "Acme HQ, New Delhi" : null,
        status: done ? InterviewStatus.COMPLETED : InterviewStatus.SCHEDULED,
        createdById: userId(slot.by[0]),
        createdAt: new Date(Math.min(now.getTime(), startsAt.getTime() - 2 * 24 * HOUR)),
        interviewers: { create: slot.by.map((key) => ({ userId: userId(key) })) },
      },
    });
    await prisma.activity.create({
      data: {
        type: ActivityType.INTERVIEW_SCHEDULED,
        candidateId: candidate.id,
        jobId: jobs.get(candidate.seed.job)!.id,
        actorId: userId(slot.by[0]),
        metadata: { interviewType: slot.type, startsAt: startsAt.toISOString() },
        createdAt: interview.createdAt,
      },
    });
    if (done) {
      await prisma.activity.create({
        data: {
          type: ActivityType.INTERVIEW_COMPLETED,
          candidateId: candidate.id,
          jobId: jobs.get(candidate.seed.job)!.id,
          actorId: userId(slot.by[0]),
          metadata: { interviewType: slot.type, startsAt: startsAt.toISOString() },
          createdAt: endsAt,
        },
      });
    }
    interviews += 1;
  }

  // Ankit's notifications: the latest few things others did, the newest ones still unread.
  const recent = await prisma.activity.findMany({
    where: { OR: [{ actorId: null }, { actorId: { not: userId("ankit") } }], type: { in: [ActivityType.CANDIDATE_ADDED, ActivityType.STAGE_CHANGED] } },
    include: { candidate: { select: { id: true, name: true } }, job: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
    take: 6,
  });
  for (const [i, a] of recent.entries()) {
    const to = (a.metadata as { toStage?: Stage } | null)?.toStage;
    const title =
      a.type === ActivityType.CANDIDATE_ADDED
        ? `${a.candidate?.name} applied for ${a.job?.title}`
        : to === Stage.OFFER
          ? `${a.candidate?.name} received an offer`
          : to === Stage.HIRED
            ? `${a.candidate?.name} was hired`
            : to === Stage.REJECTED
              ? `${a.candidate?.name} was rejected`
              : `${a.candidate?.name} moved to ${to ? STAGE_DISPLAY_NAMES[to] : "a new stage"}`;
    await prisma.notification.create({
      data: {
        userId: userId("ankit"),
        title,
        href: `/candidates?open=${a.candidate?.id}`,
        createdAt: a.createdAt,
        readAt: i < 3 ? null : new Date(a.createdAt.getTime() + HOUR),
      },
    });
  }

  console.log(`Seeded ${TEAM.length} team members, ${JOBS.length} jobs, ${created.length} candidates and ${interviews} interviews.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
