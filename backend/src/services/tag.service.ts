import { prisma } from "../db/prisma";
import { CandidateNotFoundError, NotFoundError } from "../domain/errors";

export const TAG_COLORS = ["blue", "green", "amber", "rose", "violet", "slate"] as const;

/** A stable colour per name, so the same tag looks the same everywhere without asking the user to pick. */
export function defaultTagColor(name: string): string {
  let hash = 0;
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[hash % TAG_COLORS.length];
}

export async function listTags() {
  const tags = await prisma.tag.findMany({
    include: { _count: { select: { candidates: true } } },
    orderBy: { name: "asc" },
  });
  return tags.map((t) => ({ id: t.id, name: t.name, color: t.color, candidateCount: t._count.candidates }));
}

/** Attaches a tag by name, creating it if no tag with that name (any casing) exists. Idempotent. */
export async function addTagToCandidate(candidateId: string, name: string, color?: string) {
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.candidate.findUnique({ where: { id: candidateId }, select: { id: true } });
    if (!candidate) throw new CandidateNotFoundError(candidateId);

    const existing = await tx.tag.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    const tag = existing ?? (await tx.tag.create({ data: { name, color: color ?? defaultTagColor(name) } }));

    await tx.candidateTag.upsert({
      where: { candidateId_tagId: { candidateId, tagId: tag.id } },
      update: {},
      create: { candidateId, tagId: tag.id },
    });
    return tag;
  });
}

export async function removeTagFromCandidate(candidateId: string, tagId: string): Promise<void> {
  const result = await prisma.candidateTag.deleteMany({ where: { candidateId, tagId } });
  if (result.count === 0) throw new NotFoundError("Tag on candidate", `${candidateId}/${tagId}`);
}
