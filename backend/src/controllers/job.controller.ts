import { Request, Response } from "express";
import { actingUser } from "../middleware/currentUser";
import { createJob as createJobService, getJob as getJobService, getJobsOverview, listJobs as listJobsService, updateJob as updateJobService } from "../services/job.service";
import { parseCreateJobBody, parseListJobsQuery, parseUpdateJobBody } from "../validation/job.validation";

export async function listJobs(req: Request, res: Response) {
  res.status(200).json(await listJobsService(parseListJobsQuery(req.query)));
}

export async function jobsOverview(_req: Request, res: Response) {
  res.status(200).json(await getJobsOverview());
}

export async function getJob(req: Request<{ id: string }>, res: Response) {
  res.status(200).json(await getJobService(req.params.id));
}

export async function createJob(req: Request, res: Response) {
  res.status(201).json(await createJobService(parseCreateJobBody(req.body), actingUser(req)));
}

export async function updateJob(req: Request<{ id: string }>, res: Response) {
  res.status(200).json(await updateJobService(req.params.id, parseUpdateJobBody(req.body)));
}
