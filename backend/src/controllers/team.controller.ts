import { Request, Response } from "express";
import { CAPABILITIES, ROLE_LABELS } from "../domain/permissions";
import { actingUser } from "../middleware/currentUser";
import { createMember, listTeam, toMeResponse, updateMe as updateMeService, updateMember } from "../services/team.service";
import { parseCreateMemberBody, parseListTeamQuery, parseUpdateMeBody, parseUpdateMemberBody } from "../validation/team.validation";

export async function getMe(req: Request, res: Response) {
  res.status(200).json(toMeResponse(actingUser(req)));
}

export async function updateMe(req: Request, res: Response) {
  res.status(200).json(await updateMeService(actingUser(req), parseUpdateMeBody(req.body)));
}

export async function listMembers(req: Request, res: Response) {
  res.status(200).json(await listTeam(parseListTeamQuery(req.query)));
}

export async function addMember(req: Request, res: Response) {
  res.status(201).json(await createMember(parseCreateMemberBody(req.body), actingUser(req)));
}

export async function patchMember(req: Request<{ id: string }>, res: Response) {
  res.status(200).json(await updateMember(req.params.id, parseUpdateMemberBody(req.body), actingUser(req)));
}

export function roleCapabilities(_req: Request, res: Response) {
  res.status(200).json({
    roles: Object.entries(ROLE_LABELS).map(([role, label]) => ({ role, label })),
    capabilities: CAPABILITIES,
  });
}
