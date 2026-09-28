import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { Stage } from "@prisma/client";
import { app } from "../../src/app";
import { prisma } from "../../src/db/prisma";
import { getBaseline, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function createCandidate(overrides: Partial<{ name: string; email: string; phone: string }> = {}) {
  const res = await request(app)
    .post("/api/candidates")
    .send({
      name: overrides.name ?? "Test Candidate",
      email: overrides.email ?? `candidate-${Date.now()}-${Math.random()}@example.com`,
      jobId: getBaseline().job.id,
      ...(overrides.phone ? { phone: overrides.phone } : {}),
    });
  return res.body as { id: string; currentStage: Stage };
}

describe("POST /api/candidates", () => {
  it("creates a candidate at the Applied stage", async () => {
    const res = await request(app)
      .post("/api/candidates")
      .send({ name: "Priya Sharma", email: "priya@example.com", phone: "+91-90000-00000", jobId: getBaseline().job.id });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Priya Sharma",
      email: "priya@example.com",
      phone: "+91-90000-00000",
      currentStage: "APPLIED",
      daysInCurrentStage: 0,
    });
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.currentStageSince).toEqual(res.body.createdAt);
  });

  it("allows phone to be omitted", async () => {
    const res = await request(app)
      .post("/api/candidates")
      .send({ name: "No Phone", email: "nophone@example.com", jobId: getBaseline().job.id });

    expect(res.status).toBe(201);
    expect(res.body.phone).toBeNull();
  });

  it("rejects a missing name with 400", async () => {
    const res = await request(app).post("/api/candidates").send({ email: "x@example.com", jobId: getBaseline().job.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "name" })]),
    );
  });

  it("rejects an invalid email with 400", async () => {
    const res = await request(app)
      .post("/api/candidates")
      .send({ name: "Bad Email", email: "not-an-email", jobId: getBaseline().job.id });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "email" })]),
    );
  });

  it("rejects a duplicate email with 409", async () => {
    await createCandidate({ email: "dup@example.com" });
    const res = await request(app)
      .post("/api/candidates")
      .send({ name: "Someone Else", email: "dup@example.com", jobId: getBaseline().job.id });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });
});

describe("GET /api/candidates", () => {
  it("returns an empty page when there are no candidates", async () => {
    const res = await request(app).get("/api/candidates");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it("lists created candidates with stage and duration info", async () => {
    await createCandidate({ name: "A" });
    await createCandidate({ name: "B" });

    const res = await request(app).get("/api/candidates");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(2);
    for (const candidate of res.body.items) {
      expect(candidate).toHaveProperty("currentStage");
      expect(candidate).toHaveProperty("currentStageSince");
      expect(candidate).toHaveProperty("daysInCurrentStage");
    }
  });

  it("filters by stage via ?stage=", async () => {
    const inScreening = await createCandidate({ name: "Screener" });
    await createCandidate({ name: "StillApplied" });
    await request(app)
      .post(`/api/candidates/${inScreening.id}/transition`)
      .send({ toStage: "SCREENING" });

    const res = await request(app).get("/api/candidates?stage=SCREENING");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(inScreening.id);
  });

  it("rejects an invalid stage filter with 400", async () => {
    const res = await request(app).get("/api/candidates?stage=NOT_A_STAGE");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/candidates/:id", () => {
  it("returns candidate details including time in current stage", async () => {
    const created = await createCandidate();
    const res = await request(app).get(`/api/candidates/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
    expect(res.body).toHaveProperty("currentStageSince");
    expect(res.body).toHaveProperty("daysInCurrentStage");
  });

  it("returns 404 for an unknown candidate", async () => {
    const res = await request(app).get("/api/candidates/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

describe("GET /api/candidates/:id/history", () => {
  it("returns an empty array for a candidate still Applied", async () => {
    const created = await createCandidate();
    const res = await request(app).get(`/api/candidates/${created.id}/history`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns complete chronological history after transitions", async () => {
    const created = await createCandidate();
    await request(app).post(`/api/candidates/${created.id}/transition`).send({ toStage: "SCREENING" });
    await request(app).post(`/api/candidates/${created.id}/transition`).send({ toStage: "INTERVIEW" });

    const res = await request(app).get(`/api/candidates/${created.id}/history`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ fromStage: "APPLIED", toStage: "SCREENING" });
    expect(res.body[1]).toMatchObject({ fromStage: "SCREENING", toStage: "INTERVIEW" });
  });

  it("returns 404 for an unknown candidate", async () => {
    const res = await request(app).get("/api/candidates/does-not-exist/history");
    expect(res.status).toBe(404);
  });

  it("exposes no mutating route for history", async () => {
    const created = await createCandidate();
    const del = await request(app).delete(`/api/candidates/${created.id}/history`);
    const put = await request(app).put(`/api/candidates/${created.id}/history`);
    expect(del.status).toBe(404);
    expect(put.status).toBe(404);
  });
});

describe("POST /api/candidates/:id/transition", () => {
  it("applies a valid transition", async () => {
    const created = await createCandidate();
    const res = await request(app)
      .post(`/api/candidates/${created.id}/transition`)
      .send({ toStage: "SCREENING" });

    expect(res.status).toBe(200);
    expect(res.body.currentStage).toBe("SCREENING");
  });

  it("rejects skipping a stage with 409 and a clear message", async () => {
    const created = await createCandidate();
    const res = await request(app)
      .post(`/api/candidates/${created.id}/transition`)
      .send({ toStage: "INTERVIEW" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/skip/i);
    expect(res.body).toMatchObject({ from: "APPLIED", to: "INTERVIEW" });
  });

  it("rejects moving backwards with 409", async () => {
    const created = await createCandidate();
    await request(app).post(`/api/candidates/${created.id}/transition`).send({ toStage: "SCREENING" });

    const res = await request(app)
      .post(`/api/candidates/${created.id}/transition`)
      .send({ toStage: "APPLIED" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/backwards/i);
  });

  it("rejects any change once Hired with 409", async () => {
    const created = await createCandidate();
    for (const stage of ["SCREENING", "INTERVIEW", "OFFER", "HIRED"]) {
      await request(app).post(`/api/candidates/${created.id}/transition`).send({ toStage: stage });
    }

    const res = await request(app)
      .post(`/api/candidates/${created.id}/transition`)
      .send({ toStage: "REJECTED" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/final/i);
  });

  it("rejects any change once Rejected with 409", async () => {
    const created = await createCandidate();
    await request(app).post(`/api/candidates/${created.id}/reject`);

    const res = await request(app)
      .post(`/api/candidates/${created.id}/transition`)
      .send({ toStage: "SCREENING" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/final/i);
  });

  it("rejects a missing/invalid toStage with 400", async () => {
    const created = await createCandidate();
    const res = await request(app).post(`/api/candidates/${created.id}/transition`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("returns 404 for an unknown candidate", async () => {
    const res = await request(app)
      .post("/api/candidates/does-not-exist/transition")
      .send({ toStage: "SCREENING" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/candidates/:id/reject", () => {
  it("rejects a candidate from Applied and records history", async () => {
    const created = await createCandidate();
    const res = await request(app).post(`/api/candidates/${created.id}/reject`);

    expect(res.status).toBe(200);
    expect(res.body.currentStage).toBe("REJECTED");

    const history = await request(app).get(`/api/candidates/${created.id}/history`);
    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({ fromStage: "APPLIED", toStage: "REJECTED" });
  });

  it("rejects a candidate from a mid-pipeline stage", async () => {
    const created = await createCandidate();
    await request(app).post(`/api/candidates/${created.id}/transition`).send({ toStage: "SCREENING" });
    await request(app).post(`/api/candidates/${created.id}/transition`).send({ toStage: "INTERVIEW" });

    const res = await request(app).post(`/api/candidates/${created.id}/reject`);
    expect(res.status).toBe(200);
    expect(res.body.currentStage).toBe("REJECTED");
  });

  it("cannot reject a Hired candidate", async () => {
    const created = await createCandidate();
    for (const stage of ["SCREENING", "INTERVIEW", "OFFER", "HIRED"]) {
      await request(app).post(`/api/candidates/${created.id}/transition`).send({ toStage: stage });
    }

    const res = await request(app).post(`/api/candidates/${created.id}/reject`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/final/i);
  });

  it("cannot reject an already-Rejected candidate", async () => {
    const created = await createCandidate();
    await request(app).post(`/api/candidates/${created.id}/reject`);

    const res = await request(app).post(`/api/candidates/${created.id}/reject`);
    expect(res.status).toBe(409);
  });

  it("returns 404 for an unknown candidate", async () => {
    const res = await request(app).post("/api/candidates/does-not-exist/reject");
    expect(res.status).toBe(404);
  });
});

describe("simultaneous requests for the same candidate", () => {
  it("answers one with 200 and the other with 409 rather than applying both", async () => {
    const created = await createCandidate();

    const [a, b] = await Promise.all([
      request(app).post(`/api/candidates/${created.id}/transition`).send({ toStage: "SCREENING" }),
      request(app).post(`/api/candidates/${created.id}/transition`).send({ toStage: "SCREENING" }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const history = await request(app).get(`/api/candidates/${created.id}/history`);
    expect(history.body).toHaveLength(1);
  });

  it("never reports both a rejection and a move as successful for a candidate that ends up moved", async () => {
    const created = await createCandidate();

    const [move, reject] = await Promise.all([
      request(app).post(`/api/candidates/${created.id}/transition`).send({ toStage: "SCREENING" }),
      request(app).post(`/api/candidates/${created.id}/reject`),
    ]);

    const final = await request(app).get(`/api/candidates/${created.id}`);
    expect(reject.status).toBe(200); // a rejection is always allowed from Applied or Screening
    expect(final.body.currentStage).toBe("REJECTED"); // and nothing may un-reject it
    expect([200, 409]).toContain(move.status);
  });
});

describe("malformed requests", () => {
  it("returns 400 for malformed JSON bodies", async () => {
    const res = await request(app)
      .post("/api/candidates")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
  });
});
