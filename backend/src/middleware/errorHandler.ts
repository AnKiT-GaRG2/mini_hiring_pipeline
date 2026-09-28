import { ErrorRequestHandler } from "express";
import {
  CandidateNotFoundError,
  DuplicateEmailError,
  InvalidTransitionError,
  RequestValidationError,
} from "../domain/errors";

/**
 * Single place mapping domain/validation errors to HTTP responses, so
 * controllers stay free of try/catch — Express 5 forwards a rejected async
 * handler's error here automatically.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof RequestValidationError) {
    res.status(400).json({
      error: "Validation failed",
      details: err.zodError.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof CandidateNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof DuplicateEmailError) {
    res.status(409).json({ error: err.message });
    return;
  }

  if (err instanceof InvalidTransitionError) {
    res.status(409).json({ error: err.message, from: err.from, to: err.to });
    return;
  }

  // express.json() throws a SyntaxError with a 4xx `status` for malformed
  // request bodies — surface that instead of a generic 500.
  if (err instanceof SyntaxError && "status" in err && typeof err.status === "number") {
    res.status(err.status).json({ error: "Malformed request body" });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
