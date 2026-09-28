import { Request, Response } from "express";
import { Stage } from "@prisma/client";
import {
  createCandidate as createCandidateService,
  getCandidateById,
  getCandidateHistory,
  listCandidates as listCandidatesService,
  transitionCandidateStage,
} from "../services/candidate.service";
import {
  parseCreateCandidateBody,
  parseListCandidatesQuery,
  parseTransitionBody,
} from "../validation/candidate.validation";
import { toCandidateResponse, toStageHistoryResponse } from "./candidate.presenter";

export async function createCandidate(req: Request, res: Response) {
  const input = parseCreateCandidateBody(req.body);
  const candidate = await createCandidateService(input);
  res.status(201).json(toCandidateResponse(candidate));
}

export async function listCandidates(req: Request, res: Response) {
  const { stage } = parseListCandidatesQuery(req.query);
  const candidates = await listCandidatesService({ stage });
  res.status(200).json(candidates.map((c) => toCandidateResponse(c)));
}

type CandidateIdParams = { id: string };

export async function getCandidate(req: Request<CandidateIdParams>, res: Response) {
  const candidate = await getCandidateById(req.params.id);
  res.status(200).json(toCandidateResponse(candidate));
}

export async function getHistory(req: Request<CandidateIdParams>, res: Response) {
  const history = await getCandidateHistory(req.params.id);
  res.status(200).json(history.map(toStageHistoryResponse));
}

export async function transitionCandidate(req: Request<CandidateIdParams>, res: Response) {
  const { toStage } = parseTransitionBody(req.body);
  const candidate = await transitionCandidateStage(req.params.id, toStage);
  res.status(200).json(toCandidateResponse(candidate));
}

export async function rejectCandidate(req: Request<CandidateIdParams>, res: Response) {
  const candidate = await transitionCandidateStage(req.params.id, Stage.REJECTED);
  res.status(200).json(toCandidateResponse(candidate));
}
