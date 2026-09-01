/**
 * Who a signed-in user is, and what that lets them see.
 *
 * Three roles, stored as one column on `user`. A department user is just a
 * citizen an admin has attached to a department, which is why the role and the
 * department are separate fields rather than one enum: revoking someone's
 * department assignment should not silently strip their ability to sign in.
 *
 * Shared by server and client, so this file must stay free of `server-only`.
 */

export const ROLES = ["citizen", "department", "admin"] as const

export type Role = (typeof ROLES)[number]

export const DEFAULT_ROLE: Role = "citizen"

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  citizen: {
    label: "Citizen",
    description: "Submits and tracks their own complaints.",
  },
  department: {
    label: "Department user",
    description: "Works the complaints routed to their department.",
  },
  admin: {
    label: "Admin",
    description: "Full control over users, departments and every complaint.",
  },
}

/** Narrow an untrusted string - a request body, a database column - to a role. */
export function toRole(value: unknown): Role {
  return ROLES.includes(value as Role) ? (value as Role) : DEFAULT_ROLE
}

export function isAdmin(role: Role) {
  return role === "admin"
}

/**
 * Whether this role may act on complaints it does not own - accept, change
 * status, add remarks. Admins can do everything a department user can.
 */
export function isStaff(role: Role) {
  return role === "department" || role === "admin"
}
