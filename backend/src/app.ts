import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { healthRouter } from "./routes/health.routes";
import { candidateRouter, noteRouter, tagRouter } from "./routes/candidate.routes";
import { searchRouter } from "./routes/search.routes";
import { jobRouter } from "./routes/job.routes";
import { companyRouter } from "./routes/company.routes";
import { interviewRouter } from "./routes/interview.routes";
import { meRouter, teamRouter } from "./routes/team.routes";
import { activityRouter, dashboardRouter, notificationRouter } from "./routes/feed.routes";
import { attachCurrentUser } from "./middleware/currentUser";
import { errorHandler } from "./middleware/errorHandler";

export const app = express();

// The frontend is deployed on a different origin (Vercel) than this API (Render), so the
// browser needs an explicit CORS allow before it'll let the frontend read a response.
if (env.frontendOrigin) app.use(cors({ origin: env.frontendOrigin }));

// Company logos and cover images travel as data: URLs, so allow bodies a little over the 1.5 MB cover limit.
app.use(express.json({ limit: "3mb" }));

app.use("/health", healthRouter);

// Everything under /api acts as a team member (see middleware/currentUser).
app.use("/api", attachCurrentUser);
app.use("/api/me", meRouter);
app.use("/api/team", teamRouter);
app.use("/api/company", companyRouter);
app.use("/api/jobs", jobRouter);
app.use("/api/candidates", candidateRouter);
app.use("/api/notes", noteRouter);
app.use("/api/tags", tagRouter);
app.use("/api/interviews", interviewRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/activity", activityRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/search", searchRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

export default app;
