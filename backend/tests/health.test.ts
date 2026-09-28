import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app";

describe("GET /health", () => {
  it("returns a 200 with an ok status payload", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.timestamp).toBe("string");
    expect(typeof res.body.uptime).toBe("number");
  });
});
