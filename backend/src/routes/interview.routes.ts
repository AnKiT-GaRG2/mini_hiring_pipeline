import { Router } from "express";
import * as interviewController from "../controllers/interview.controller";

export const interviewRouter = Router();

interviewRouter.get("/", interviewController.listInterviews);
interviewRouter.get("/upcoming", interviewController.upcomingInterviews);
interviewRouter.get("/stats", interviewController.interviewStats);
interviewRouter.get("/:id", interviewController.getInterview);
interviewRouter.post("/", interviewController.createInterview);
interviewRouter.patch("/:id", interviewController.updateInterview);
