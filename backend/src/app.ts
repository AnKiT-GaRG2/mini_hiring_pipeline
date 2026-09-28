import express from "express";
import { healthRouter } from "./routes/health.routes";
import { candidateRouter } from "./routes/candidate.routes";
import { searchRouter } from "./routes/search.routes";
import { errorHandler } from "./middleware/errorHandler";

export const app = express();

app.use(express.json());

app.use("/health", healthRouter);
app.use("/api/candidates", candidateRouter);
app.use("/api/search", searchRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

export default app;
