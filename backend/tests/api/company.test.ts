import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { UserRole } from "@prisma/client";
import { prisma } from "../../src/db/prisma";
import { createUser, resetDatabase } from "../helpers/db";
import { as, api } from "../helpers/http";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

// A real 1×1 PNG.
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const valid = {
  name: "Acme Inc.",
  website: "https://acme.com",
  industry: "Technology",
  size: "51–200 employees",
  location: "New Delhi, India",
  description: "We build modern products.",
};

describe("GET /api/company", () => {
  it("returns a placeholder company on first read, plus the choices for the form", async () => {
    const res = await api.get("/api/company");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("My company");
    expect(res.body.options.industries).toContain("Technology");
    expect(res.body.options.sizes).toContain("51–200 employees");
    expect(await prisma.company.count()).toBe(1);
  });

  it("never creates a second company row", async () => {
    await api.get("/api/company");
    await api.put("/api/company").send(valid);
    await api.get("/api/company");
    expect(await prisma.company.count()).toBe(1);
  });
});

describe("PUT /api/company", () => {
  it("saves the profile", async () => {
    const res = await api.put("/api/company").send(valid);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(valid);

    const read = await api.get("/api/company");
    expect(read.body).toMatchObject(valid);
  });

  it("requires a name", async () => {
    const res = await api.put("/api/company").send({ ...valid, name: "  " });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe("name");
  });

  it("requires a full website URL", async () => {
    expect((await api.put("/api/company").send({ ...valid, website: "acme" })).status).toBe(400);
    expect((await api.put("/api/company").send({ ...valid, website: "javascript:alert(1)" })).status).toBe(400);
  });

  it("clears the website when sent empty", async () => {
    await api.put("/api/company").send(valid);
    const res = await api.put("/api/company").send({ ...valid, website: "" });
    expect(res.status).toBe(200);
    expect(res.body.website).toBeNull();
  });

  it("only accepts industries and sizes from the lists", async () => {
    expect((await api.put("/api/company").send({ ...valid, industry: "Piracy" })).status).toBe(400);
    expect((await api.put("/api/company").send({ ...valid, size: "lots" })).status).toBe(400);
  });

  it("stores a logo and cover image, keeps them when a later save omits them, and removes them when sent null", async () => {
    await api.put("/api/company").send({ ...valid, logoDataUrl: PIXEL, coverDataUrl: PIXEL });

    const kept = await api.put("/api/company").send({ ...valid, description: "Changed" });
    expect(kept.body.logoDataUrl).toBe(PIXEL);
    expect(kept.body.coverDataUrl).toBe(PIXEL);
    expect(kept.body.description).toBe("Changed");

    const removed = await api.put("/api/company").send({ ...valid, logoDataUrl: null });
    expect(removed.body.logoDataUrl).toBeNull();
    expect(removed.body.coverDataUrl).toBe(PIXEL);
  });

  it("refuses images that are not PNG, JPEG or WebP data URLs (SVG can carry scripts)", async () => {
    const svg = `data:image/svg+xml;base64,${Buffer.from("<svg onload='alert(1)'/>").toString("base64")}`;
    expect((await api.put("/api/company").send({ ...valid, logoDataUrl: svg })).status).toBe(400);
    expect((await api.put("/api/company").send({ ...valid, logoDataUrl: "https://evil.example/logo.png" })).status).toBe(400);
  });

  it("refuses an oversized logo", async () => {
    const huge = `data:image/png;base64,${"A".repeat(400_001)}`;
    const res = await api.put("/api/company").send({ ...valid, logoDataUrl: huge });
    expect(res.status).toBe(400);
    expect(res.body.details[0].message).toMatch(/too large/i);
  });

  it("is forbidden to recruiters, who can still read it", async () => {
    const recruiter = await createUser({ role: UserRole.RECRUITER });
    expect((await as(recruiter).put("/api/company").send(valid)).status).toBe(403);
    expect((await as(recruiter).get("/api/company")).status).toBe(200);
  });
});
