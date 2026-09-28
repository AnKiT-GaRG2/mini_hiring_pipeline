import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { UserRole, UserStatus } from "@prisma/client";
import { app } from "../../src/app";
import { prisma } from "../../src/db/prisma";
import { createUser, resetDatabase, TEST_USER_EMAIL } from "../helpers/db";
import { as, api } from "../helpers/http";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe("who a request acts as", () => {
  it("defaults to the configured team member", async () => {
    const res = await api.get("/api/me");
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(TEST_USER_EMAIL);
    expect(res.body.role).toBe("HIRING_MANAGER");
  });

  it("acts as the member named by x-user-id", async () => {
    const recruiter = await createUser({ name: "Rita Recruiter", role: UserRole.RECRUITER });
    const res = await as(recruiter).get("/api/me");
    expect(res.body).toMatchObject({ id: recruiter.id, name: "Rita Recruiter", role: "RECRUITER", permissions: [] });
  });

  it("answers 401 when x-user-id matches nobody", async () => {
    const res = await request(app).get("/api/me").set("x-user-id", "nobody");
    expect(res.status).toBe(401);
  });

  it("answers 403 for a deactivated member", async () => {
    const gone = await createUser({ status: UserStatus.DEACTIVATED });
    const res = await as(gone).get("/api/me");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/deactivated/i);
  });

  it("does not require a team member for /health", async () => {
    await prisma.user.deleteMany();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });
});

describe("first run", () => {
  it("creates the default user as an Admin when nobody exists yet", async () => {
    await prisma.user.deleteMany();

    const res = await api.get("/api/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: TEST_USER_EMAIL, role: "ADMIN" });
    expect(await prisma.user.count()).toBe(1);
  });

  it("does not invent a user once the team has members", async () => {
    await prisma.user.deleteMany({ where: { email: TEST_USER_EMAIL } });
    await createUser({ email: "someone.else@example.com" });

    const res = await api.get("/api/me");
    expect(res.status).toBe(401);
    expect(await prisma.user.count()).toBe(1);
  });
});
