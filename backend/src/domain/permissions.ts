import { UserRole } from "@prisma/client";

/**
 * What each role may do beyond the everyday work every team member shares
 * (candidates, notes, interviews, messages). Enforced by the API; the UI only
 * hides what a role cannot do.
 */
export type Permission = "team:manage" | "company:edit" | "jobs:manage" | "admin:assign";

const MANAGER_PERMISSIONS: Permission[] = ["team:manage", "company:edit", "jobs:manage"];

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = {
  [UserRole.ADMIN]: [...MANAGER_PERMISSIONS, "admin:assign"],
  [UserRole.HIRING_MANAGER]: MANAGER_PERMISSIONS,
  [UserRole.RECRUITER]: [],
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  [UserRole.ADMIN]: "Admin",
  [UserRole.HIRING_MANAGER]: "Hiring Manager",
  [UserRole.RECRUITER]: "Recruiter",
};

/** The capability matrix shown on the Manage Teams page. Mirrors ROLE_PERMISSIONS. */
export const CAPABILITIES: readonly { label: string; description: string; roles: readonly UserRole[] }[] = [
  {
    label: "Work with candidates",
    description: "Add candidates, move them through the pipeline, reject, add notes and tags.",
    roles: ["ADMIN", "HIRING_MANAGER", "RECRUITER"],
  },
  {
    label: "Schedule interviews",
    description: "Schedule, reschedule, cancel and complete interviews.",
    roles: ["ADMIN", "HIRING_MANAGER", "RECRUITER"],
  },
  {
    label: "Send messages",
    description: "Read and reply to candidate conversations.",
    roles: ["ADMIN", "HIRING_MANAGER", "RECRUITER"],
  },
  {
    label: "Manage jobs",
    description: "Create, edit, pause and close job openings.",
    roles: ["ADMIN", "HIRING_MANAGER"],
  },
  {
    label: "Edit company details",
    description: "Change the company profile and branding.",
    roles: ["ADMIN", "HIRING_MANAGER"],
  },
  {
    label: "Manage team members",
    description: "Add members, change roles of Recruiters and Hiring Managers, deactivate members.",
    roles: ["ADMIN", "HIRING_MANAGER"],
  },
  {
    label: "Manage Admins",
    description: "Grant or remove the Admin role, and deactivate Admins.",
    roles: ["ADMIN"],
  },
];
