-- Enables trigram-based fuzzy string matching, used for deterministic
-- fuzzy candidate-name search (see backend/src/search).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Speeds up similarity()/word_similarity() lookups against Candidate.name
-- once the table is large; harmless at seed-data scale.
CREATE INDEX IF NOT EXISTS "Candidate_name_trgm_idx" ON "Candidate" USING GIN (name gin_trgm_ops);
