import { ErrorRequestHandler } from "express";
import {
  ConflictError,
  DuplicateEmailError,
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  RequestValidationError,
  UnauthenticatedError,
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

  if (err instanceof UnauthenticatedError) {
    res.status(401).json({ error: err.message });
    return;
  }

  if (err instanceof ForbiddenError) {
    res.status(403).json({ error: err.message });
    return;
  }

  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof DuplicateEmailError || err instanceof ConflictError) {
    res.status(409).json({ error: err.message });
    return;
  }

  if (err instanceof InvalidTransitionError) {
    res.status(409).json({ error: err.message, from: err.from, to: err.to });
    return;
  }

  // express.json() throws a SyntaxError (400) for malformed bodies and an error
  // with type "entity.too.large" (413) for oversized ones — surface those
  // instead of a generic 500.
  if (typeof err === "object" && err !== null && "status" in err && typeof err.status === "number" && err.status < 500) {
    const message = "type" in err && err.type === "entity.too.large" ? "Request body is too large" : "Malformed request body";
    res.status(err.status).json({ error: message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
