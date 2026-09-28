import { PrismaClient, Stage } from "@prisma/client";
import { validateTransition } from "../backend/src/domain/stageTransitions";

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

type Hop = { stage: Stage; daysAgo: number };

type CandidateSeed = {
  name: string;
  email: string;
  phone?: string;
  appliedDaysAgo: number;
  // Chronological sequence of transitions away from APPLIED, oldest first.
  path: Hop[];
};

const candidates: CandidateSeed[] = [
  {
    name: "Priya Sharma",
    email: "priya.sharma@example.com",
    phone: "+91-98765-43210",
    appliedDaysAgo: 2,
    path: [],
  },
  {
    name: "Rahul Mehta",
    email: "rahul.mehta@example.com",
    appliedDaysAgo: 10,
    path: [{ stage: Stage.SCREENING, daysAgo: 8 }],
  },
  {
    name: "Ananya Iyer",
    email: "ananya.iyer@example.com",
    phone: "+91-98123-45678",
    appliedDaysAgo: 5,
    path: [{ stage: Stage.SCREENING, daysAgo: 2 }],
  },
  {
    name: "Vikram Nair",
    email: "vikram.nair@example.com",
    appliedDaysAgo: 20,
    path: [
      { stage: Stage.SCREENING, daysAgo: 15 },
      { stage: Stage.INTERVIEW, daysAgo: 3 },
    ],
  },
  {
    name: "Sneha Reddy",
    email: "sneha.reddy@example.com",
    phone: "+91-99887-66554",
    appliedDaysAgo: 25,
    path: [
      { stage: Stage.SCREENING, daysAgo: 18 },
      { stage: Stage.INTERVIEW, daysAgo: 10 },
    ],
  },
  {
    name: "Arjun Kapoor",
    email: "arjun.kapoor@example.com",
    appliedDaysAgo: 30,
    path: [
      { stage: Stage.SCREENING, daysAgo: 25 },
      { stage: Stage.INTERVIEW, daysAgo: 15 },
      { stage: Stage.OFFER, daysAgo: 4 },
    ],
  },
  {
    name: "Divya Menon",
    email: "divya.menon@example.com",
    phone: "+91-97654-32109",
    appliedDaysAgo: 35,
    path: [
      { stage: Stage.SCREENING, daysAgo: 28 },
      { stage: Stage.INTERVIEW, daysAgo: 20 },
      { stage: Stage.OFFER, daysAgo: 1 },
    ],
  },
  {
    name: "Karan Malhotra",
    email: "karan.malhotra@example.com",
    appliedDaysAgo: 45,
    path: [
      { stage: Stage.SCREENING, daysAgo: 40 },
      { stage: Stage.INTERVIEW, daysAgo: 30 },
      { stage: Stage.OFFER, daysAgo: 10 },
      { stage: Stage.HIRED, daysAgo: 2 },
    ],
  },
  {
    name: "Neha Joshi",
    email: "neha.joshi@example.com",
    phone: "+91-96543-21098",
    appliedDaysAgo: 50,
    path: [
      { stage: Stage.SCREENING, daysAgo: 45 },
      { stage: Stage.INTERVIEW, daysAgo: 35 },
      { stage: Stage.OFFER, daysAgo: 15 },
      { stage: Stage.HIRED, daysAgo: 10 },
    ],
  },
  {
    name: "Aditya Verma",
    email: "aditya.verma@example.com",
    appliedDaysAgo: 12,
    path: [{ stage: Stage.REJECTED, daysAgo: 9 }],
  },
  {
    name: "Ritu Singh",
    email: "ritu.singh@example.com",
    phone: "+91-95432-10987",
    appliedDaysAgo: 40,
    path: [
      { stage: Stage.SCREENING, daysAgo: 35 },
      { stage: Stage.INTERVIEW, daysAgo: 25 },
      { stage: Stage.OFFER, daysAgo: 10 },
      { stage: Stage.REJECTED, daysAgo: 8 },
    ],
  },
  {
    name: "Manish Kumar",
    email: "manish.kumar@example.com",
    appliedDaysAgo: 6,
    path: [{ stage: Stage.REJECTED, daysAgo: 5 }],
  },
];

async function seedCandidate(seed: CandidateSeed) {
  await prisma.$transaction(async (tx) => {
    const created = await tx.candidate.create({
      data: {
        name: seed.name,
        email: seed.email,
        phone: seed.phone ?? null,
        currentStage: Stage.APPLIED,
        createdAt: daysAgo(seed.appliedDaysAgo),
        updatedAt: daysAgo(seed.appliedDaysAgo),
      },
    });

    let currentStage = created.currentStage;

    for (const hop of seed.path) {
      // Reuse the same rules the live transition service enforces, so seed
      // data can never encode an invalid stage sequence.
      const result = validateTransition(currentStage, hop.stage);
      if (!result.valid) {
        throw new Error(
          `Seed data for ${seed.name} has an invalid transition ${currentStage} -> ${hop.stage}: ${result.reason}`,
        );
      }

      const changedAt = daysAgo(hop.daysAgo);

      await tx.stageHistory.create({
        data: {
          candidateId: created.id,
          fromStage: currentStage,
          toStage: hop.stage,
          changedAt,
        },
      });

      await tx.candidate.update({
        where: { id: created.id },
        data: { currentStage: hop.stage, updatedAt: changedAt },
      });

      currentStage = hop.stage;
    }
  });
}

async function main() {
  // Seeding writes StageHistory rows with backdated timestamps directly via
  // Prisma, bypassing the transition service on purpose (see candidate
  // service's doc comment). TRUNCATE also bypasses the append-only trigger,
  // which only blocks UPDATE/DELETE statements — this is deliberate: it's a
  // dev/ops reset, not something the application's own API can do.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "StageHistory", "Candidate" RESTART IDENTITY CASCADE',
  );

  for (const seed of candidates) {
    await seedCandidate(seed);
  }

  console.log(`Seeded ${candidates.length} candidates.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
