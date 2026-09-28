import { Prisma, User, UserRole, UserStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import { ConflictError, ForbiddenError, NotFoundError } from "../domain/errors";
import { can, ROLE_PERMISSIONS } from "../domain/permissions";

export function toUserResponse(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    jobTitle: user.jobTitle,
    phone: user.phone,
    location: user.location,
    joinedAt: user.joinedAt.toISOString(),
  };
}

export function toMeResponse(user: User) {
  return { ...toUserResponse(user), permissions: ROLE_PERMISSIONS[user.role] };
}

export async function listTeam(filter: { q?: string; role?: UserRole }) {
  const where: Prisma.UserWhereInput = {
    ...(filter.role ? { role: filter.role } : {}),
    ...(filter.q
      ? { OR: [{ name: { contains: filter.q, mode: "insensitive" } }, { email: { contains: filter.q, mode: "insensitive" } }] }
      : {}),
  };
  const [members, grouped] = await Promise.all([
    prisma.user.findMany({ where, orderBy: [{ status: "asc" }, { joinedAt: "asc" }, { name: "asc" }] }),
    prisma.user.groupBy({ by: ["role"], where: { status: UserStatus.ACTIVE }, _count: { _all: true } }),
  ]);

  const byRole: Record<UserRole, number> = { ADMIN: 0, HIRING_MANAGER: 0, RECRUITER: 0 };
  for (const g of grouped) byRole[g.role] = g._count._all;

  return {
    members: members.map(toUserResponse),
    summary: { total: byRole.ADMIN + byRole.HIRING_MANAGER + byRole.RECRUITER, byRole },
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function createMember(
  input: { name: string; email: string; role: UserRole; jobTitle?: string | null },
  actor: User,
) {
  if (input.role === UserRole.ADMIN && !can(actor.role, "admin:assign")) {
    throw new ForbiddenError("Only an Admin can add another Admin.");
  }
  try {
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, role: input.role, jobTitle: input.jobTitle ?? null },
    });
    return toUserResponse(user);
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(`A team member with email ${input.email} already exists.`);
    throw err;
  }
}

export async function updateMember(
  id: string,
  patch: { name?: string; role?: UserRole; status?: UserStatus; jobTitle?: string | null },
  actor: User,
) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new NotFoundError("Team member", id);

  const changesRole = patch.role !== undefined && patch.role !== target.role;
  const changesStatus = patch.status !== undefined && patch.status !== target.status;

  if (target.id === actor.id && (changesRole || changesStatus)) {
    throw new ForbiddenError("You can’t change your own role or status.");
  }

  // Touching the Admin role in either direction (granting it, removing it, or
  // deactivating an Admin) is an Admin-only act.
  const touchesAdmin =
    (changesRole && (patch.role === UserRole.ADMIN || target.role === UserRole.ADMIN)) ||
    (changesStatus && target.role === UserRole.ADMIN);
  if (touchesAdmin && !can(actor.role, "admin:assign")) {
    throw new ForbiddenError("Only an Admin can change an Admin’s role or status.");
  }

  const user = await prisma.user.update({
    where: { id },
    data: { name: patch.name, role: patch.role, status: patch.status, jobTitle: patch.jobTitle },
  });
  return toUserResponse(user);
}

export async function updateMe(
  actor: User,
  patch: { name?: string; email?: string; jobTitle?: string | null; phone?: string | null; location?: string | null },
) {
  try {
    const user = await prisma.user.update({ where: { id: actor.id }, data: patch });
    return toMeResponse(user);
  } catch (err) {
    if (isUniqueViolation(err) && patch.email) {
      throw new ConflictError(`A team member with email ${patch.email} already exists.`);
    }
    throw err;
  }
}
