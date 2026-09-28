import { ActivityType, User, UserRole } from "@prisma/client";
import { prisma } from "../db/prisma";
import { CandidateNotFoundError, ForbiddenError, NotFoundError } from "../domain/errors";
import { recordActivity } from "./activity.service";

const authorSelect = { select: { id: true, name: true } } as const;

export function toNoteResponse(note: {
  id: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string };
}) {
  return { id: note.id, body: note.body, createdAt: note.createdAt.toISOString(), author: note.author };
}

export async function listNotes(candidateId: string) {
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { id: true } });
  if (!candidate) throw new CandidateNotFoundError(candidateId);
  return prisma.note.findMany({
    where: { candidateId },
    include: { author: authorSelect },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function addNote(candidateId: string, body: string, actor: User) {
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.candidate.findUnique({ where: { id: candidateId }, select: { id: true, jobId: true } });
    if (!candidate) throw new CandidateNotFoundError(candidateId);

    const note = await tx.note.create({
      data: { candidateId, authorId: actor.id, body },
      include: { author: authorSelect },
    });
    await recordActivity(tx, {
      type: ActivityType.NOTE_ADDED,
      candidateId,
      jobId: candidate.jobId,
      actorId: actor.id,
    });
    return note;
  });
}

/** Authors can delete their own notes; managers and admins can delete anyone's. */
export async function deleteNote(noteId: string, actor: User): Promise<void> {
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) throw new NotFoundError("Note", noteId);
  if (note.authorId !== actor.id && actor.role === UserRole.RECRUITER) {
    throw new ForbiddenError("You can only delete your own notes.");
  }
  await prisma.note.delete({ where: { id: noteId } });
}
