import { PrismaClient } from "@prisma/client";

// Singleton so we don't open a new connection pool per import.
export const prisma = new PrismaClient();
