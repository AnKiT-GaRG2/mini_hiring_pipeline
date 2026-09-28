// Runs before any test file's module graph loads, so this must win the race
// against src/config/env.ts's dotenv.config() call (which never overrides an
// already-set variable). This keeps integration tests off the dev database.
process.env.DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/mini_hiring_pipeline_test?schema=public";
process.env.NODE_ENV = "test";
