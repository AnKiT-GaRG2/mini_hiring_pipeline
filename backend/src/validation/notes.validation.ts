import { z } from "zod";
import { parseWith } from "./common";
import { TAG_COLORS } from "../services/tag.service";

export const parseNoteBody = (body: unknown) =>
  parseWith(z.object({ body: z.string().trim().min(1, "note can't be empty").max(4000, "note is too long") }), body);

export const parseTagBody = (body: unknown) =>
  parseWith(
    z.object({
      name: z.string().trim().min(1, "tag can't be empty").max(30, "tag is at most 30 characters"),
      color: z.enum(TAG_COLORS).optional(),
    }),
    body,
  );
