import { describe, it, expect } from "vitest";
import { UserRole } from "@prisma/client";
import { CAPABILITIES, can, ROLE_PERMISSIONS } from "../../src/domain/permissions";

describe("can", () => {
  it("lets only admins assign the Admin role", () => {
    expect(can(UserRole.ADMIN, "admin:assign")).toBe(true);
    expect(can(UserRole.HIRING_MANAGER, "admin:assign")).toBe(false);
    expect(can(UserRole.RECRUITER, "admin:assign")).toBe(false);
  });

  it("lets admins and hiring managers manage jobs, the team and the company", () => {
    for (const role of [UserRole.ADMIN, UserRole.HIRING_MANAGER]) {
      expect(can(role, "jobs:manage")).toBe(true);
      expect(can(role, "team:manage")).toBe(true);
      expect(can(role, "company:edit")).toBe(true);
    }
  });

  it("gives recruiters none of the management permissions", () => {
    expect(ROLE_PERMISSIONS[UserRole.RECRUITER]).toEqual([]);
  });
});

describe("CAPABILITIES (the table shown on the Manage Teams page)", () => {
  it("agrees with ROLE_PERMISSIONS about who may manage jobs, the company and the team", () => {
    const rolesFor = (label: string) => CAPABILITIES.find((c) => c.label === label)?.roles;

    expect(rolesFor("Manage jobs")).toEqual(Object.values(UserRole).filter((r) => can(r, "jobs:manage")));
    expect(rolesFor("Edit company details")).toEqual(Object.values(UserRole).filter((r) => can(r, "company:edit")));
    expect(rolesFor("Manage team members")).toEqual(Object.values(UserRole).filter((r) => can(r, "team:manage")));
    expect(rolesFor("Manage Admins")).toEqual(Object.values(UserRole).filter((r) => can(r, "admin:assign")));
  });
});
