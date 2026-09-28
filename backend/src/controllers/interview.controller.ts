import { Request, Response } from "express";
import { actingUser } from "../middleware/currentUser";
import {
  getInterview as getInterviewService,
  getInterviewStats,
  listInterviews as listInterviewsService,
  listUpcoming,
  scheduleInterview,
  updateInterview as updateInterviewService,
} from "../services/interview.service";
import {
  parseCreateInterviewBody,
  parseInterviewStatsQuery,
  parseListInterviewsQuery,
  parseUpcomingQuery,
  parseUpdateInterviewBody,
} from "../validation/interview.validation";

export async function listInterviews(req: Request, res: Response) {
  res.status(200).json(await listInterviewsService(parseListInterviewsQuery(req.query)));
}

export async function upcomingInterviews(req: Request, res: Response) {
  res.status(200).json(await listUpcoming(parseUpcomingQuery(req.query).limit));
}

export async function interviewStats(req: Request, res: Response) {
  res.status(200).json(await getInterviewStats(parseInterviewStatsQuery(req.query)));
}

export async function getInterview(req: Request<{ id: string }>, res: Response) {
  res.status(200).json(await getInterviewService(req.params.id));
}

export async function createInterview(req: Request, res: Response) {
  res.status(201).json(await scheduleInterview(parseCreateInterviewBody(req.body), actingUser(req)));
}

export async function updateInterview(req: Request<{ id: string }>, res: Response) {
  res.status(200).json(await updateInterviewService(req.params.id, parseUpdateInterviewBody(req.body), actingUser(req)));
}
