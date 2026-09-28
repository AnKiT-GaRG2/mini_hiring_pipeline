import { prisma } from "../../src/db/prisma";

/**
 * Test-only reset. TRUNCATE bypasses the StageHistory append-only trigger
 * (which only intercepts UPDATE/DELETE) — that's fine here because this is
 * test infrastructure, not a path the application's own API exposes.
 */
export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "StageHistory", "Candidate" RESTART IDENTITY CASCADE',
  );
}
