import { Router } from "express";
import * as candidateController from "../controllers/candidate.controller";

export const candidateRouter = Router();

// Fixed paths first, so "counts" and "export.csv" are never read as a candidate id.
candidateRouter.get("/counts", candidateController.stageCounts);
candidateRouter.get("/export.csv", candidateController.exportCandidates);

candidateRouter.post("/", candidateController.createCandidate);
candidateRouter.get("/", candidateController.listCandidates);
candidateRouter.get("/:id", candidateController.getCandidate);
candidateRouter.patch("/:id", candidateController.updateCandidate);
candidateRouter.get("/:id/history", candidateController.getHistory);
candidateRouter.post("/:id/transition", candidateController.transitionCandidate);
candidateRouter.post("/:id/reject", candidateController.rejectCandidate);
candidateRouter.get("/:id/interviews", candidateController.getCandidateInterviews);
candidateRouter.get("/:id/notes", candidateController.getNotes);
candidateRouter.post("/:id/notes", candidateController.createNote);
candidateRouter.post("/:id/tags", candidateController.attachTag);
candidateRouter.delete("/:id/tags/:tagId", candidateController.detachTag);

export const noteRouter = Router();
noteRouter.delete("/:noteId", candidateController.removeNote);

export const tagRouter = Router();
tagRouter.get("/", candidateController.getTags);
