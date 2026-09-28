import { Stage } from "@prisma/client";
import { ZodError } from "zod";

export class CandidateNotFoundError extends Error {
  constructor(public readonly candidateId: string) {
    super(`Candidate ${candidateId} not found`);
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
