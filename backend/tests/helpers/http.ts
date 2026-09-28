import request from "supertest";
import { User } from "@prisma/client";
import { app } from "../../src/app";

/** HTTP calls made as a particular team member (the default acting user when omitted). */
export function as(user?: Pick<User, "id">) {
  const withUser = (req: request.Test) => (user ? req.set("x-user-id", user.id) : req);
  return {
    get: (url: string) => withUser(request(app).get(url)),
    post: (url: string) => withUser(request(app).post(url)),
    patch: (url: string) => withUser(request(app).patch(url)),
    put: (url: string) => withUser(request(app).put(url)),
    delete: (url: string) => withUser(request(app).delete(url)),
  };
}

export const api = as();
