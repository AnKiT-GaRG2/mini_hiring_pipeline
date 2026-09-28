import dotenv from "dotenv";
import path from "path";

// __dirname is backend/src (dev, via tsx) or backend/dist (build) — both one
// level under backend/, so the root .env is always two levels up from here.
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
};
