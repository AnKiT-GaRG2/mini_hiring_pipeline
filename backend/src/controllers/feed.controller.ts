import { Request, Response } from "express";
import { actingUser } from "../middleware/currentUser";
import { getDashboard } from "../services/dashboard.service";
import { listActivity } from "../services/activity.service";
import { listNotifications, markNotificationsRead } from "../services/notification.service";
import { parseActivityQuery, parseDashboardQuery, parseNotificationsReadBody } from "../validation/dashboard.validation";

export async function dashboard(req: Request, res: Response) {
  res.status(200).json(await getDashboard(parseDashboardQuery(req.query)));
}

export async function activity(req: Request, res: Response) {
  res.status(200).json(await listActivity(parseActivityQuery(req.query)));
}

export async function notifications(req: Request, res: Response) {
  res.status(200).json(await listNotifications(actingUser(req)));
}

export async function readNotifications(req: Request, res: Response) {
  const { ids } = parseNotificationsReadBody(req.body);
  res.status(200).json({ updated: await markNotificationsRead(actingUser(req), ids) });
}
