import { z } from "zod";
import { UserRole, UserStatus } from "@prisma/client";
import { emailField, optionalText, parseWith } from "./common";

const nameField = z.string().trim().min(1, "name is required").max(150, "name is too long");

export const parseCreateMemberBody = (body: unknown) =>
  parseWith(
    z.object({
      name: nameField,
      email: emailField,
      role: z.nativeEnum(UserRole).default(UserRole.RECRUITER),
      jobTitle: optionalText(100),
    }),
    body,
  );

export const parseUpdateMemberBody = (body: unknown) =>
  parseWith(
    z.object({
      name: nameField.optional(),
      role: z.nativeEnum(UserRole).optional(),
      status: z.nativeEnum(UserStatus).optional(),
      jobTitle: optionalText(100),
    }),
    body,
  );

export const parseListTeamQuery = (query: unknown) =>
  parseWith(
    z.object({
      q: z.string().trim().max(200).optional(),
      role: z.nativeEnum(UserRole).optional(),
    }),
    query,
  );

export const parseUpdateMeBody = (body: unknown) =>
  parseWith(
    z.object({
      name: nameField.optional(),
      email: emailField.optional(),
      jobTitle: optionalText(100),
      phone: optionalText(50),
      location: optionalText(150),
    }),
    body,
  );

export const INDUSTRIES = [
  "Technology",
  "Finance",
  "Healthcare",
  "Education",
  "Retail",
  "Manufacturing",
  "Media",
  "Consulting",
  "Other",
] as const;

export const COMPANY_SIZES = ["1–10 employees", "11–50 employees", "51–200 employees", "201–500 employees", "501+ employees"] as const;

const dataUrl = (maxChars: number, label: string) =>
  z
    .string()
    .max(maxChars, `${label} is too large`)
    // SVG is left out on purpose: it can carry scripts.
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/, `${label} must be a PNG, JPG or WebP image`)
    .nullish();

export const parseUpdateCompanyBody = (body: unknown) =>
  parseWith(
    z.object({
      name: z.string().trim().min(1, "company name is required").max(150),
      website: z
        .string()
        .trim()
        .max(300)
        .transform((v) => (v === "" ? null : v))
        .refine((v) => v === null || /^https?:\/\/\S+\.\S+$/i.test(v), "must be a full URL like https://acme.com")
        .nullish(),
      industry: z.enum(INDUSTRIES).nullish(),
      size: z.enum(COMPANY_SIZES).nullish(),
      location: optionalText(150),
      description: optionalText(500),
      logoDataUrl: dataUrl(400_000, "logo"),
      coverDataUrl: dataUrl(1_500_000, "cover image"),
    }),
    body,
  );
