import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { UserRole, UserStatus } from "@prisma/client";
import { prisma } from "../../src/db/prisma";
import { createUser, resetDatabase } from "../helpers/db";
import { as, api } from "../helpers/http";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe("GET /api/team", () => {
  it("lists members with a summary of active members per role", async () => {
    await createUser({ name: "Rec One", role: UserRole.RECRUITER });
    await createUser({ name: "Rec Two", role: UserRole.RECRUITER });
    await createUser({ name: "Boss", role: UserRole.ADMIN });
    await createUser({ name: "Gone", role: UserRole.RECRUITER, status: UserStatus.DEACTIVATED });

    const res = await api.get("/api/team");
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(5); // includes the deactivated one and the acting manager
    expect(res.body.summary).toEqual({ total: 4, byRole: { ADMIN: 1, HIRING_MANAGER: 1, RECRUITER: 2 } });
    expect(res.body.members[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), name: expect.any(String), email: expect.any(String), role: expect.any(String), status: "ACTIVE" }),
    );
  });

  it("puts active members before deactivated ones", async () => {
    await createUser({ name: "Gone", status: UserStatus.DEACTIVATED });
    const res = await api.get("/api/team");
    expect(res.body.members.at(-1).name).toBe("Gone");
  });

  it("filters by name or email text and by role, without changing the summary", async () => {
    await createUser({ name: "Priya Shah", email: "priya.shah@example.com", role: UserRole.RECRUITER });
    await createUser({ name: "Rohit Verma", email: "rohit@example.com", role: UserRole.RECRUITER });

    const byName = await api.get("/api/team?q=priya");
    expect(byName.body.members.map((m: { name: string }) => m.name)).toEqual(["Priya Shah"]);

    const byEmail = await api.get("/api/team?q=ROHIT@");
    expect(byEmail.body.members.map((m: { name: string }) => m.name)).toEqual(["Rohit Verma"]);

    const byRole = await api.get("/api/team?role=HIRING_MANAGER");
    expect(byRole.body.members.map((m: { name: string }) => m.name)).toEqual(["Test Manager"]);
    expect(byRole.body.summary.total).toBe(3); // the summary describes the whole team, not the filtered rows
  });

  it("rejects an unknown role filter with 400", async () => {
    expect((await api.get("/api/team?role=CEO")).status).toBe(400);
  });
});

describe("POST /api/team", () => {
  it("adds a member (recruiter by default) and normalises the email", async () => {
    const res = await api.post("/api/team").send({ name: "  New Person ", email: "NEW.Person@Example.com" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "New Person", email: "new.person@example.com", role: "RECRUITER", status: "ACTIVE" });
  });

  it("rejects a duplicate email with 409", async () => {
    await createUser({ email: "taken@example.com" });
    const res = await api.post("/api/team").send({ name: "Copy", email: "taken@example.com" });
    expect(res.status).toBe(409);
  });

  it("validates name and email", async () => {
    const res = await api.post("/api/team").send({ name: "", email: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual(["email", "name"]);
  });

  it("is forbidden to recruiters", async () => {
    const recruiter = await createUser({ role: UserRole.RECRUITER });
    const res = await as(recruiter).post("/api/team").send({ name: "X", email: "x@example.com" });
    expect(res.status).toBe(403);
  });

  it("lets only an Admin add another Admin", async () => {
    const asManager = await api.post("/api/team").send({ name: "Sneaky", email: "sneaky@example.com", role: "ADMIN" });
    expect(asManager.status).toBe(403);

    const admin = await createUser({ role: UserRole.ADMIN });
    const asAdmin = await as(admin).post("/api/team").send({ name: "Trusted", email: "trusted@example.com", role: "ADMIN" });
    expect(asAdmin.status).toBe(201);
    expect(asAdmin.body.role).toBe("ADMIN");
  });
});

describe("PATCH /api/team/:id", () => {
  it("changes a recruiter's role", async () => {
    const rec = await createUser({ role: UserRole.RECRUITER });
    const res = await api.patch(`/api/team/${rec.id}`).send({ role: "HIRING_MANAGER" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("HIRING_MANAGER");
  });

  it("deactivates and reactivates a member", async () => {
    const rec = await createUser({ role: UserRole.RECRUITER });
    const off = await api.patch(`/api/team/${rec.id}`).send({ status: "DEACTIVATED" });
    expect(off.body.status).toBe("DEACTIVATED");

    expect((await as(rec).get("/api/me")).status).toBe(403);

    const on = await api.patch(`/api/team/${rec.id}`).send({ status: "ACTIVE" });
    expect(on.body.status).toBe("ACTIVE");
    expect((await as(rec).get("/api/me")).status).toBe(200);
  });

  it("does not let a manager grant Admin, or touch an existing Admin", async () => {
    const rec = await createUser({ role: UserRole.RECRUITER });
    const admin = await createUser({ role: UserRole.ADMIN });

    expect((await api.patch(`/api/team/${rec.id}`).send({ role: "ADMIN" })).status).toBe(403);
    expect((await api.patch(`/api/team/${admin.id}`).send({ role: "RECRUITER" })).status).toBe(403);
    expect((await api.patch(`/api/team/${admin.id}`).send({ status: "DEACTIVATED" })).status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe("ADMIN");
  });

  it("lets an Admin manage other Admins", async () => {
    const admin = await createUser({ role: UserRole.ADMIN });
    const other = await createUser({ role: UserRole.ADMIN });
    const res = await as(admin).patch(`/api/team/${other.id}`).send({ role: "RECRUITER" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("RECRUITER");
  });

  it("never lets someone change their own role or status", async () => {
    const admin = await createUser({ role: UserRole.ADMIN });
    expect((await as(admin).patch(`/api/team/${admin.id}`).send({ role: "RECRUITER" })).status).toBe(403);
    expect((await as(admin).patch(`/api/team/${admin.id}`).send({ status: "DEACTIVATED" })).status).toBe(403);
    // …but their own name and job title are theirs to edit.
    expect((await as(admin).patch(`/api/team/${admin.id}`).send({ jobTitle: "Head of People" })).status).toBe(200);
  });

  it("answers 404 for an unknown member and is forbidden to recruiters", async () => {
    expect((await api.patch("/api/team/nobody").send({ role: "RECRUITER" })).status).toBe(404);

    const rec = await createUser({ role: UserRole.RECRUITER });
    const other = await createUser({ role: UserRole.RECRUITER });
    expect((await as(rec).patch(`/api/team/${other.id}`).send({ role: "ADMIN" })).status).toBe(403);
  });
});

describe("/api/me", () => {
  it("returns the acting member with their permissions", async () => {
    const res = await api.get("/api/me");
    expect(res.body.permissions).toEqual(expect.arrayContaining(["team:manage", "company:edit", "jobs:manage"]));
    expect(res.body.permissions).not.toContain("admin:assign");
  });

  it("lets a member edit their own details", async () => {
    const res = await api.patch("/api/me").send({ name: "Ankit G.", phone: "+91 90000 00000", location: "Delhi", jobTitle: "Lead" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Ankit G.", phone: "+91 90000 00000", location: "Delhi", jobTitle: "Lead" });
  });

  it("clears a detail sent as an empty string, and leaves omitted ones alone", async () => {
    await api.patch("/api/me").send({ phone: "123", location: "Delhi" });
    const res = await api.patch("/api/me").send({ phone: "" });
    expect(res.body.phone).toBeNull();
    expect(res.body.location).toBe("Delhi");
  });

  it("refuses an email another member already uses", async () => {
    await createUser({ email: "taken@example.com" });
    const res = await api.patch("/api/me").send({ email: "taken@example.com" });
    expect(res.status).toBe(409);
  });

  it("validates the email", async () => {
    expect((await api.patch("/api/me").send({ email: "not-an-email" })).status).toBe(400);
  });
});

describe("GET /api/team/roles", () => {
  it("describes what each role can do", async () => {
    const res = await api.get("/api/team/roles");
    expect(res.status).toBe(200);
    expect(res.body.roles.map((r: { role: string }) => r.role)).toEqual(["ADMIN", "HIRING_MANAGER", "RECRUITER"]);
    expect(res.body.capabilities.length).toBeGreaterThan(3);
    expect(res.body.capabilities[0]).toEqual(expect.objectContaining({ label: expect.any(String), roles: expect.any(Array) }));
  });
});
