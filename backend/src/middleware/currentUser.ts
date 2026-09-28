import { RequestHandler, Request } from "express";
import { User, UserRole, UserStatus } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { ForbiddenError, UnauthenticatedError } from "../domain/errors";
import { can, Permission } from "../domain/permissions";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

/**
 * Resolves who is acting on this request.
 *
 * There is no authentication yet, so this is a stand-in: the acting user is the
 * one named by the `x-user-id` header, else the configured default. That makes
 * every role reachable by anyone who can reach the API — fine for a local demo
 * and for testing role rules, and exactly the thing real authentication must
 * replace before this is exposed to anyone.
 */
export const attachCurrentUser: RequestHandler = async (req, _res, next) => {
  const headerId = req.header("x-user-id");
  const user = headerId
    ? await prisma.user.findUnique({ where: { id: headerId } })
    : ((await prisma.user.findUnique({ where: { email: env.defaultUserEmail } })) ?? (await bootstrapFirstUser()));

  if (!user) throw new UnauthenticatedError("No team member matches this request.");
  if (user.status !== UserStatus.ACTIVE) throw new ForbiddenError("This account is deactivated.");

  req.user = user;
  next();
};

/**
 * On a brand-new install nobody exists yet, so nobody could ever add anybody.
 * The first request creates the default user as an Admin; once any team member
 * exists this never runs again.
 */
async function bootstrapFirstUser(): Promise<User | null> {
  if ((await prisma.user.count()) > 0) return null;
  const local = env.defaultUserEmail.split("@")[0];
  const name = local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return prisma.user.upsert({
    where: { email: env.defaultUserEmail },
    update: {},
    create: { email: env.defaultUserEmail, name, role: UserRole.ADMIN },
  });
}

/** The acting user; only valid on routes mounted after attachCurrentUser. */
export function actingUser(req: Request): User {
  if (!req.user) throw new UnauthenticatedError();
  return req.user;
}

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!can(actingUser(req).role, permission)) throw new ForbiddenError();
    next();
  };
}
