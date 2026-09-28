import { Router } from "express";
import * as teamController from "../controllers/team.controller";
import { requirePermission } from "../middleware/currentUser";

export const meRouter = Router();
meRouter.get("/", teamController.getMe);
meRouter.patch("/", teamController.updateMe);

export const teamRouter = Router();
teamRouter.get("/", teamController.listMembers);
teamRouter.get("/roles", teamController.roleCapabilities);
teamRouter.post("/", requirePermission("team:manage"), teamController.addMember);
teamRouter.patch("/:id", requirePermission("team:manage"), teamController.patchMember);
