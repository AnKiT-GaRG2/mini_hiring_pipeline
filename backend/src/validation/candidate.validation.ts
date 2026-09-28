import { z } from "zod";
import { CandidateSource, Stage } from "@prisma/client";
import { emailField, optionalText, optionalUrl, parseWith } from "./common";

const stageEnum = z.nativeEnum(Stage, {
  errorMap: () => ({ message: `must be one of: ${Object.values(Stage).join(", ")}` }),
});

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date like 2024-08-31")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "must be a real date");

const experienceSchema = z
  .object({
    title: z.string().trim().min(1, "title is required").max(150),
    company: z.string().trim().min(1, "company is required").max(150),
    startDate: isoDate,
    endDate: isoDate.nullish(),
    description: optionalText(1000),
  })
  .refine((e) => !e.endDate || e.endDate >= e.startDate, {
    message: "endDate cannot be before startDate",
    path: ["endDate"],
  });

const educationSchema = z
  .object({
    degree: z.string().trim().min(1, "degree is required").max(150),
    fieldOfStudy: optionalText(150),
    institution: z.string().trim().min(1, "institution is required").max(200),
    startYear: z.number().int().min(1950).max(2100).nullish(),
    endYear: z.number().int().min(1950).max(2100).nullish(),
  })
  .refine((e) => !e.startYear || !e.endYear || e.endYear >= e.startYear, {
    message: "endYear cannot be before startYear",
    path: ["endYear"],
  });

/** Trim, drop blanks, and remove case-insensitive duplicates while keeping order. */
const skillsSchema = z
  .array(z.string().trim().max(50, "a skill is at most 50 characters"))
  .transform((skills) => {
    const seen = new Set<string>();
    return skills.filter((s) => {
      const key = s.toLowerCase();
      if (s === "" || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })
  .pipe(z.array(z.string()).max(30, "at most 30 skills"));

const profileShape = {
  name: z.string().trim().min(1, "name is required").max(200, "name is too long"),
  email: emailField,
  phone: z.string().trim().min(1, "phone must not be empty").max(50, "phone is too long").nullish(),
  jobId: z.string().min(1, "jobId is required"),
  location: optionalText(150),
  source: z.nativeEnum(CandidateSource).optional(),
  yearsOfExperience: z.number().int("must be a whole number of years").min(0).max(60).optional(),
  summary: optionalText(2000),
  githubUrl: optionalUrl,
  linkedinUrl: optionalUrl,
  portfolioUrl: optionalUrl,
  resumeUrl: optionalUrl,
  skills: skillsSchema.optional(),
  experiences: z.array(experienceSchema).max(30).optional(),
  education: z.array(educationSchema).max(15).optional(),
};

const createCandidateSchema = z.object(profileShape);
export type CreateCandidateBody = z.infer<typeof createCandidateSchema>;
export const parseCreateCandidateBody = (body: unknown) => parseWith(createCandidateSchema, body);

// Every field optional; `null` clears an optional field, omitting it leaves it alone.
const updateCandidateSchema = z.object(profileShape).partial();
export type UpdateCandidateBody = z.infer<typeof updateCandidateSchema>;
export const parseUpdateCandidateBody = (body: unknown) => parseWith(updateCandidateSchema, body);

const transitionSchema = z.object({
  toStage: z.nativeEnum(Stage, {
    errorMap: () => ({ message: `toStage must be one of: ${Object.values(Stage).join(", ")}` }),
  }),
});
export const parseTransitionBody = (body: unknown) => parseWith(transitionSchema, body);

export const EXPERIENCE_BUCKETS = ["fresher", "junior", "mid", "senior"] as const;
export const CANDIDATE_SORTS = ["latest", "oldest", "name", "stage", "longest-in-stage"] as const;

const filterShape = {
  q: z.string().trim().max(200).optional(),
  jobId: z.string().min(1).optional(),
  stage: z
    .nativeEnum(Stage, {
      errorMap: () => ({ message: `stage must be one of: ${Object.values(Stage).join(", ")}` }),
    })
    .optional(),
  experience: z.enum(EXPERIENCE_BUCKETS).optional(),
  tagId: z.string().min(1).optional(),
  sort: z.enum(CANDIDATE_SORTS).default("latest"),
  // Comma-separated ids, used to export a hand-picked selection.
  ids: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined)),
};

const listCandidatesQuerySchema = z.object({
  ...filterShape,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListCandidatesQuery = z.infer<typeof listCandidatesQuerySchema>;
export const parseListCandidatesQuery = (query: unknown) => parseWith(listCandidatesQuerySchema, query);

const exportQuerySchema = z.object(filterShape);
export const parseExportQuery = (query: unknown) => parseWith(exportQuerySchema, query);

const stageCountsQuerySchema = z.object({ jobId: z.string().min(1).optional() });
export const parseStageCountsQuery = (query: unknown) => parseWith(stageCountsQuerySchema, query);

export { stageEnum };
