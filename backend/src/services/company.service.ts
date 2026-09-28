import { Company } from "@prisma/client";
import { prisma } from "../db/prisma";

const COMPANY_ID = "company";

export function toCompanyResponse(company: Company) {
  return {
    name: company.name,
    website: company.website,
    industry: company.industry,
    size: company.size,
    location: company.location,
    description: company.description,
    logoDataUrl: company.logoDataUrl,
    coverDataUrl: company.coverDataUrl,
    updatedAt: company.updatedAt.toISOString(),
  };
}

/** The single company row; created with a placeholder name the first time it is read. */
export async function getCompany() {
  const company = await prisma.company.upsert({
    where: { id: COMPANY_ID },
    update: {},
    create: { id: COMPANY_ID, name: "My company" },
  });
  return toCompanyResponse(company);
}

export async function updateCompany(input: {
  name: string;
  website?: string | null;
  industry?: string | null;
  size?: string | null;
  location?: string | null;
  description?: string | null;
  logoDataUrl?: string | null;
  coverDataUrl?: string | null;
}) {
  // `undefined` leaves a field alone; `null` clears it. So the images survive a save that doesn't touch them.
  const data = {
    name: input.name,
    website: input.website,
    industry: input.industry,
    size: input.size,
    location: input.location,
    description: input.description,
    logoDataUrl: input.logoDataUrl,
    coverDataUrl: input.coverDataUrl,
  };
  const company = await prisma.company.upsert({
    where: { id: COMPANY_ID },
    update: data,
    create: { id: COMPANY_ID, ...data },
  });
  return toCompanyResponse(company);
}
