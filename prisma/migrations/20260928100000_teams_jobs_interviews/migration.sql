-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'HIRING_MANAGER', 'RECRUITER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('OPEN', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('REMOTE', 'HYBRID', 'ON_SITE');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('LINKEDIN', 'REFERRAL', 'CAREER_PAGE', 'JOB_BOARD', 'AGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('INITIAL', 'TECHNICAL', 'HR', 'PANEL', 'HIRING_MANAGER', 'OFFER_DISCUSSION');

-- CreateEnum
CREATE TYPE "MeetingPlatform" AS ENUM ('ZOOM', 'GOOGLE_MEET', 'PHONE', 'ON_SITE');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CANDIDATE_ADDED', 'STAGE_CHANGED', 'NOTE_ADDED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_RESCHEDULED', 'INTERVIEW_CANCELLED', 'INTERVIEW_COMPLETED');

-- AlterTable
-- jobId is added nullable first so the rows that already exist can be backfilled
-- (below) before the column becomes NOT NULL.
ALTER TABLE "Candidate" ADD COLUMN     "githubUrl" TEXT,
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "portfolioUrl" TEXT,
ADD COLUMN     "resumeUrl" TEXT,
ADD COLUMN     "source" "CandidateSource" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "yearsOfExperience" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StageHistory" ADD COLUMN     "changedById" TEXT;

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL DEFAULT 'company',
    "name" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "location" TEXT,
    "description" TEXT,
    "logoDataUrl" TEXT,
    "coverDataUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'RECRUITER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "jobTitle" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "workMode" "WorkMode" NOT NULL DEFAULT 'ON_SITE',
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "status" "JobStatus" NOT NULL DEFAULT 'OPEN',
    "openings" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSkill" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CandidateSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateExperience" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "description" TEXT,

    CONSTRAINT "CandidateExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateEducation" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "fieldOfStudy" TEXT,
    "institution" TEXT NOT NULL,
    "startYear" INTEGER,
    "endYear" INTEGER,

    CONSTRAINT "CandidateEducation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateTag" (
    "candidateId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateTag_pkey" PRIMARY KEY ("candidateId","tagId")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "type" "InterviewType" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "platform" "MeetingPlatform" NOT NULL DEFAULT 'GOOGLE_MEET',
    "meetingLink" TEXT,
    "location" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewParticipant" (
    "interviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "InterviewParticipant_pkey" PRIMARY KEY ("interviewId","userId")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "candidateId" TEXT,
    "jobId" TEXT,
    "actorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "CandidateSkill_name_idx" ON "CandidateSkill"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSkill_candidateId_name_key" ON "CandidateSkill"("candidateId", "name");

-- CreateIndex
CREATE INDEX "CandidateExperience_candidateId_idx" ON "CandidateExperience"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateEducation_candidateId_idx" ON "CandidateEducation"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "CandidateTag_tagId_idx" ON "CandidateTag"("tagId");

-- CreateIndex
CREATE INDEX "Note_candidateId_createdAt_idx" ON "Note"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "Interview_startsAt_idx" ON "Interview"("startsAt");

-- CreateIndex
CREATE INDEX "Interview_candidateId_startsAt_idx" ON "Interview"("candidateId", "startsAt");

-- CreateIndex
CREATE INDEX "InterviewParticipant_userId_idx" ON "InterviewParticipant"("userId");

-- CreateIndex
CREATE INDEX "Activity_createdAt_idx" ON "Activity"("createdAt");

-- CreateIndex
CREATE INDEX "Activity_candidateId_createdAt_idx" ON "Activity"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Candidate_jobId_currentStage_idx" ON "Candidate"("jobId", "currentStage");

-- CreateIndex
CREATE INDEX "Candidate_createdAt_idx" ON "Candidate"("createdAt");

-- CreateIndex
CREATE INDEX "StageHistory_toStage_changedAt_idx" ON "StageHistory"("toStage", "changedAt");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill existing data -----------------------------------------------------

-- Until now updatedAt was, by construction, exactly "when the candidate entered
-- their current stage" (nothing else ever updated a candidate). Carry that over.
UPDATE "Candidate" SET "stageEnteredAt" = "updatedAt";

-- Every candidate now belongs to a job. Candidates that predate jobs go under one
-- placeholder job, which can be renamed or closed like any other.
INSERT INTO "Job" ("id", "title", "status", "updatedAt")
SELECT 'job_migrated_general', 'General applications', 'OPEN', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Candidate");

UPDATE "Candidate" SET "jobId" = 'job_migrated_general' WHERE "jobId" IS NULL;

ALTER TABLE "Candidate" ALTER COLUMN "jobId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "CandidateSkill" ADD CONSTRAINT "CandidateSkill_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateExperience" ADD CONSTRAINT "CandidateExperience_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEducation" ADD CONSTRAINT "CandidateEducation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateTag" ADD CONSTRAINT "CandidateTag_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateTag" ADD CONSTRAINT "CandidateTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageHistory" ADD CONSTRAINT "StageHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewParticipant" ADD CONSTRAINT "InterviewParticipant_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewParticipant" ADD CONSTRAINT "InterviewParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity rules the application also enforces, kept in the database too ------

ALTER TABLE "Company" ADD CONSTRAINT "Company_singleton_check" CHECK ("id" = 'company');
ALTER TABLE "Job" ADD CONSTRAINT "Job_openings_positive_check" CHECK ("openings" >= 1);
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_experience_nonnegative_check" CHECK ("yearsOfExperience" >= 0);
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_ends_after_starts_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "CandidateExperience" ADD CONSTRAINT "CandidateExperience_dates_check" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "CandidateEducation" ADD CONSTRAINT "CandidateEducation_years_check" CHECK ("startYear" IS NULL OR "endYear" IS NULL OR "endYear" >= "startYear");

-- Tag names are unique regardless of case ("High Potential" vs "high potential").
CREATE UNIQUE INDEX "Tag_name_lower_key" ON "Tag" (lower("name"));
