-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED');

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "currentStage" "Stage" NOT NULL DEFAULT 'APPLIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageHistory" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "fromStage" "Stage" NOT NULL,
    "toStage" "Stage" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_email_key" ON "Candidate"("email");

-- CreateIndex
CREATE INDEX "Candidate_currentStage_idx" ON "Candidate"("currentStage");

-- CreateIndex
CREATE INDEX "StageHistory_candidateId_idx" ON "StageHistory"("candidateId");

-- AddForeignKey
ALTER TABLE "StageHistory" ADD CONSTRAINT "StageHistory_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: a stage-history row must represent an actual change
ALTER TABLE "StageHistory" ADD CONSTRAINT "StageHistory_from_ne_to_check" CHECK ("fromStage" IS DISTINCT FROM "toStage");

-- Append-only enforcement: StageHistory rows may only ever be inserted.
-- This is a second line of defense below the "no update/delete route exists"
-- rule in the application layer — even a bug or a future ad-hoc script that
-- talks to the database directly cannot mutate or erase audit history.
CREATE OR REPLACE FUNCTION prevent_stage_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'StageHistory rows are append-only and cannot be % (id=%)', TG_OP, OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stage_history_no_update
BEFORE UPDATE ON "StageHistory"
FOR EACH ROW EXECUTE FUNCTION prevent_stage_history_mutation();

CREATE TRIGGER stage_history_no_delete
BEFORE DELETE ON "StageHistory"
FOR EACH ROW EXECUTE FUNCTION prevent_stage_history_mutation();
