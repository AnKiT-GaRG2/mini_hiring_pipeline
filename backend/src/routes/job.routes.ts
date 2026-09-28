import { Router } from "express";
import * as jobController from "../controllers/job.controller";
import { requirePermission } from "../middleware/currentUser";

export const jobRouter = Router();

jobRouter.get("/", jobController.listJobs);
jobRouter.get("/overview", jobController.jobsOverview);
jobRouter.get("/:id", jobController.getJob);
jobRouter.post("/", requirePermission("jobs:manage"), jobController.createJob);
jobRouter.patch("/:id", requirePermission("jobs:manage"), jobController.updateJob);
