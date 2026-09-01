import "server-only"

import { randomUUID } from "node:crypto"
import { and, asc, count, desc, eq, ne, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { complaint, department, priority, user } from "@/lib/db/schema"
import { slugify } from "@/lib/grievance/limits"
import { clampSeverity } from "@/lib/grievance/status"
import { toRole, type Role } from "@/lib/roles"

export { slugify }

/* -------------------------------------------------------------------------- */
/* Departments                                                                 */
/* -------------------------------------------------------------------------- */

export type DepartmentRow = {
  id: string
  name: string
  slug: string
  description: string
  active: boolean
  memberCount: number
  openCount: number
}

export async function listDepartments(): Promise<DepartmentRow[]> {
  return db
    .select({
      id: department.id,
      name: department.name,
      slug: department.slug,
      description: department.description,
      active: department.active,
      memberCount: sql<number>`(
        select count(*)::int from ${user}
        where ${user.departmentId} = ${department.id}
      )`,
      openCount: sql<number>`(
        select count(*)::int from ${complaint}
        where ${complaint.departmentId} = ${department.id}
          and ${complaint.status} not in ('resolved', 'rejected')
      )`,
    })
    .from(department)
    .orderBy(asc(department.name))
}

/** The short list the pickers use - active departments only. */
export async function listActiveDepartments() {
  return db
    .select({ id: department.id, name: department.name, slug: department.slug })
    .from(department)
    .where(eq(department.active, true))
    .orderBy(asc(department.name))
}

export async function createDepartment(values: {
  name: string
  description: string
  slug?: string
}) {
  const id = randomUUID()
  const base = values.slug?.trim() || slugify(values.name)

  // Slug is unique; a second "Water Supply" would otherwise fail the insert.
  let slug = base
  let attempt = 1
  while (
    (
      await db
        .select({ id: department.id })
        .from(department)
        .where(eq(department.slug, slug))
        .limit(1)
    ).length > 0
  ) {
    slug = `${base}-${++attempt}`
  }

  await db.insert(department).values({
    id,
    name: values.name.trim(),
    slug,
    description: values.description.trim(),
  })

  return id
}

export async function updateDepartment(
  id: string,
  values: { name: string; description: string; active: boolean },
) {
  await db
    .update(department)
    .set({
      name: values.name.trim(),
      description: values.description.trim(),
      active: values.active,
    })
    .where(eq(department.id, id))
}

export async function deleteDepartment(id: string) {
  // Complaints and members reference this with `set null`, so they survive.
  await db.delete(department).where(eq(department.id, id))
}

/* -------------------------------------------------------------------------- */
/* Priorities                                                                  */
/* -------------------------------------------------------------------------- */

export type PriorityRow = {
  id: string
  name: string
  description: string
  severity: number
  slaHours: number | null
  color: string
  active: boolean
  complaintCount: number
}

export async function listPriorities(): Promise<PriorityRow[]> {
  return db
    .select({
      id: priority.id,
      name: priority.name,
      description: priority.description,
      severity: priority.severity,
      slaHours: priority.slaHours,
      color: priority.color,
      active: priority.active,
      complaintCount: sql<number>`(
        select count(*)::int from ${complaint}
        where ${complaint.priorityId} = ${priority.id}
      )`,
    })
    .from(priority)
    .orderBy(desc(priority.severity), asc(priority.name))
}

export async function listActivePriorities() {
  return db
    .select({
      id: priority.id,
      name: priority.name,
      severity: priority.severity,
      color: priority.color,
    })
    .from(priority)
    .where(eq(priority.active, true))
    .orderBy(desc(priority.severity))
}

export async function createPriority(values: {
  name: string
  description: string
  severity: number
  slaHours: number | null
  color: string
}) {
  const id = randomUUID()

  await db.insert(priority).values({
    id,
    name: values.name.trim(),
    description: values.description.trim(),
    severity: clampSeverity(values.severity),
    slaHours: values.slaHours,
    color: values.color,
  })

  return id
}

export async function updatePriority(
  id: string,
  values: {
    name: string
    description: string
    severity: number
    slaHours: number | null
    color: string
    active: boolean
  },
) {
  await db
    .update(priority)
    .set({
      name: values.name.trim(),
      description: values.description.trim(),
      severity: clampSeverity(values.severity),
      slaHours: values.slaHours,
      color: values.color,
      active: values.active,
    })
    .where(eq(priority.id, id))
}

export async function deletePriority(id: string) {
  await db.delete(priority).where(eq(priority.id, id))
}

/* -------------------------------------------------------------------------- */
/* Users                                                                       */
/* -------------------------------------------------------------------------- */

export type ManagedUser = {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  departmentId: string | null
  departmentName: string | null
  complaintCount: number
  createdAt: Date
}

export async function listUsers(filter?: {
  role?: Role
}): Promise<ManagedUser[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      departmentId: user.departmentId,
      departmentName: department.name,
      createdAt: user.createdAt,
      complaintCount: sql<number>`(
        select count(*)::int from ${complaint}
        where ${complaint.citizenId} = ${user.id}
      )`,
    })
    .from(user)
    .leftJoin(department, eq(user.departmentId, department.id))
    .where(filter?.role ? eq(user.role, filter.role) : undefined)
    .orderBy(desc(user.createdAt))

  return rows.map((row) => ({ ...row, role: toRole(row.role) }))
}

/**
 * Change a user's role, and their department with it.
 *
 * The two move together on purpose: a user demoted out of the department role
 * keeps no queue access, and a department user always has somewhere to work.
 */
export async function setUserRole(
  id: string,
  role: Role,
  departmentId: string | null,
) {
  await db
    .update(user)
    .set({
      role,
      departmentId: role === "department" ? departmentId : null,
    })
    .where(eq(user.id, id))
}

export async function setUserActive(id: string, active: boolean) {
  await db.update(user).set({ active }).where(eq(user.id, id))
}

/** Department users, for the "assign this complaint to someone" picker. */
export async function listDepartmentMembers(departmentId: string) {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(and(eq(user.departmentId, departmentId), eq(user.active, true)))
    .orderBy(asc(user.name))
}

/** Guard against an admin removing the last way into the platform. */
export async function countOtherAdmins(excludingUserId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(user)
    .where(and(eq(user.role, "admin"), ne(user.id, excludingUserId)))

  return row?.total ?? 0
}
