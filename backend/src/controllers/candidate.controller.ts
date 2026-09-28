import { Request, Response } from "express";
import { Stage } from "@prisma/client";
import { actingUser } from "../middleware/currentUser";
import {
  createCandidate as createCandidateService,
  findAllCandidates,
  getCandidateDetail,
  getCandidateHistory,
  getStageCounts,
  listCandidates as listCandidatesService,
  transitionCandidateStage,
  updateCandidate as updateCandidateService,
} from "../services/candidate.service";
import { listCandidateInterviews } from "../services/interview.service";
import { addNote, deleteNote, listNotes, toNoteResponse } from "../services/note.service";
import { addTagToCandidate, listTags, removeTagFromCandidate } from "../services/tag.service";
import {
  parseCreateCandidateBody,
  parseExportQuery,
  parseListCandidatesQuery,
  parseStageCountsQuery,
  parseTransitionBody,
  parseUpdateCandidateBody,
} from "../validation/candidate.validation";
import { parseNoteBody, parseTagBody } from "../validation/notes.validation";
import { toCsv } from "../export/csv";
import {
  toCandidateDetailResponse,
  toCandidateResponse,
  toStageHistoryResponse,
} from "./candidate.presenter";

type IdParams = { id: string };

export async function createCandidate(req: Request, res: Response) {
  const input = parseCreateCandidateBody(req.body);
  const candidate = await createCandidateService(input, actingUser(req));
  res.status(201).json(toCandidateDetailResponse(candidate));
}

export async function listCandidates(req: Request, res: Response) {
  const result = await listCandidatesService(parseListCandidatesQuery(req.query));
  const now = new Date();
  res.status(200).json({ ...result, items: result.items.map((c) => toCandidateResponse(c, now)) });
}

export async function stageCounts(req: Request, res: Response) {
  const { jobId } = parseStageCountsQuery(req.query);
  const counts = await getStageCounts(jobId);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  res.status(200).json({ counts, total });
}

export async function exportCandidates(req: Request, res: Response) {
  const rows = await findAllCandidates(parseExportQuery(req.query));
  const now = new Date();
  const csv = toCsv(
    ["Name", "Email", "Phone", "Position", "Stage", "Source", "Location", "Years of experience", "Skills", "Tags", "Applied", "Days in stage"],
    rows.map((row) => {
      const c = toCandidateResponse(row, now);
      return [
        c.name,
        c.email,
        c.phone,
        c.job?.title,
        c.currentStage,
        c.source,
        c.location,
        c.yearsOfExperience,
        c.skills.join("; "),
        c.tags.map((t) => t.name).join("; "),
        c.createdAt.slice(0, 10),
        c.daysInCurrentStage,
      ];
    }),
  );
  res.status(200).type("text/csv").set("Content-Disposition", 'attachment; filename="candidates.csv"').send(csv);
}

export async function getCandidate(req: Request<IdParams>, res: Response) {
  res.status(200).json(toCandidateDetailResponse(await getCandidateDetail(req.params.id)));
}

export async function updateCandidate(req: Request<IdParams>, res: Response) {
  const patch = parseUpdateCandidateBody(req.body);
  res.status(200).json(toCandidateDetailResponse(await updateCandidateService(req.params.id, patch)));
}

export async function getHistory(req: Request<IdParams>, res: Response) {
  const history = await getCandidateHistory(req.params.id);
  res.status(200).json(history.map(toStageHistoryResponse));
}

export async function transitionCandidate(req: Request<IdParams>, res: Response) {
  const { toStage } = parseTransitionBody(req.body);
  const candidate = await transitionCandidateStage(req.params.id, toStage, actingUser(req));
  res.status(200).json(toCandidateResponse(candidate));
}

export async function rejectCandidate(req: Request<IdParams>, res: Response) {
  const candidate = await transitionCandidateStage(req.params.id, Stage.REJECTED, actingUser(req));
  res.status(200).json(toCandidateResponse(candidate));
}

export async function getCandidateInterviews(req: Request<IdParams>, res: Response) {
  res.status(200).json(await listCandidateInterviews(req.params.id));
}

// ── notes ──

export async function getNotes(req: Request<IdParams>, res: Response) {
  res.status(200).json((await listNotes(req.params.id)).map(toNoteResponse));
}

export async function createNote(req: Request<IdParams>, res: Response) {
  const { body } = parseNoteBody(req.body);
  res.status(201).json(toNoteResponse(await addNote(req.params.id, body, actingUser(req))));
}

export async function removeNote(req: Request<{ noteId: string }>, res: Response) {
  await deleteNote(req.params.noteId, actingUser(req));
  res.status(204).end();
}

// ── tags ──

export async function getTags(_req: Request, res: Response) {
  res.status(200).json(await listTags());
}

export async function attachTag(req: Request<IdParams>, res: Response) {
  const { name, color } = parseTagBody(req.body);
  const tag = await addTagToCandidate(req.params.id, name, color);
  res.status(201).json({ id: tag.id, name: tag.name, color: tag.color });
}

export async function detachTag(req: Request<IdParams & { tagId: string }>, res: Response) {
  await removeTagFromCandidate(req.params.id, req.params.tagId);
  res.status(204).end();
}
