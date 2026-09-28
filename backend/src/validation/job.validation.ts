import { z } from "zod";
import { EmploymentType, JobStatus, WorkMode } from "@prisma/client";
import { optionalText, parseWith } from "./common";

const jobShape = {
  title: z.string().trim().min(1, "title is required").max(150, "title is too long"),
  department: optionalText(100),
  location: optionalText(150),
  workMode: z.nativeEnum(WorkMode).optional(),
  employmentType: z.nativeEnum(EmploymentType).optional(),
  status: z.nativeEnum(JobStatus).optional(),
  openings: z.number().int("must be a whole number").min(1, "at least 1 opening").max(500).optional(),
  description: optionalText(5000),
};

const createJobSchema = z.object(jobShape);
const updateJobSchema = createJobSchema.partial();
export type CreateJobBody = z.infer<typeof createJobSchema>;
export type UpdateJobBody = z.infer<typeof updateJobSchema>;
export const parseCreateJobBody = (body: unknown) => parseWith(createJobSchema, body);
export const parseUpdateJobBody = (body: unknown) => parseWith(updateJobSchema, body);

export const JOB_SORTS = ["recent", "oldest", "applicants", "title"] as const;
export type JobSort = (typeof JOB_SORTS)[number];

export const parseListJobsQuery = (query: unknown) =>
  parseWith(
    z.object({
      status: z.nativeEnum(JobStatus).optional(),
      q: z.string().trim().max(200).optional(),
      sort: z.enum(JOB_SORTS).default("recent"),
    }),
    query,
  );
