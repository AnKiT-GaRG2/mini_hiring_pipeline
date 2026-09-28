import { Router } from "express";
import * as candidateController from "../controllers/candidate.controller";

export const candidateRouter = Router();

candidateRouter.post("/", candidateController.createCandidate);
candidateRouter.get("/", candidateController.listCandidates);
candidateRouter.get("/:id", candidateController.getCandidate);
candidateRouter.get("/:id/history", candidateController.getHistory);
candidateRouter.post("/:id/transition", candidateController.transitionCandidate);
candidateRouter.post("/:id/reject", candidateController.rejectCandidate);
