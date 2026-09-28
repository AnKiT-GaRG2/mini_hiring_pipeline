import dotenv from "dotenv";
import path from "path";

// This file lives at backend/src/config (dev, via tsx) or backend/dist/config
// (build) — both two levels under backend/, so the repo root's .env is three
// levels up from here.
dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
  // There is no sign-in yet. Until there is, every request acts as this team
  // member (or as whoever the `x-user-id` header names — see middleware/currentUser).
  defaultUserEmail: (process.env.DEFAULT_USER_EMAIL || "ankit.garg@example.com").toLowerCase(),
};
