import { Router } from "express";
import * as feedController from "../controllers/feed.controller";

export const dashboardRouter = Router();
dashboardRouter.get("/", feedController.dashboard);

export const activityRouter = Router();
activityRouter.get("/", feedController.activity);

export const notificationRouter = Router();
notificationRouter.get("/", feedController.notifications);
notificationRouter.post("/read", feedController.readNotifications);
