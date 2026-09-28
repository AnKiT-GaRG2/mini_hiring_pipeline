import { Stage } from "@prisma/client";
import { ZodError } from "zod";

/** Something the caller asked for does not exist (HTTP 404). */
export class NotFoundError extends Error {
  constructor(
    public readonly entity: string,
    public readonly id: string,
  ) {
    super(`${entity} ${id} not found`);
    this.name = "NotFoundError";
  }
}

/** The request is well-formed but conflicts with current state (HTTP 409). */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** The caller is known but not allowed to do this (HTTP 403). */
export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** No usable identity for the request (HTTP 401). */
export class UnauthenticatedError extends Error {
  constructor(message = "Not signed in.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class CandidateNotFoundError extends NotFoundError {
  constructor(public readonly candidateId: string) {
    super("Candidate", candidateId);
    this.name = "CandidateNotFoundError";
  }
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: Stage,
    public readonly to: Stage,
    reason: string,
  ) {
    super(reason);
    this.name = "InvalidTransitionError";
  }
}

export class DuplicateEmailError extends Error {
  constructor(public readonly email: string) {
    super(`A candidate with email ${email} already exists`);
    this.name = "DuplicateEmailError";
  }
}

export class RequestValidationError extends Error {
  constructor(public readonly zodError: ZodError) {
    super("Request validation failed");
    this.name = "RequestValidationError";
  }
}
