import "server-only"

import { randomUUID } from "node:crypto"
import { aliasedTable, and, count, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  complaint,
  complaintImage,
  department,
  priority,
  user,
} from "@/lib/db/schema"
import { recordEvent, notify } from "@/lib/grievance/events"
import { cellFor, isValidCoordinate } from "@/lib/grievance/geo"
import { newReference } from "@/lib/grievance/reference"
import { signedViewUrl, verifyUpload } from "@/lib/grievance/storage"
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from "@/lib/grievance/limits"
import {
  toComplaintStatus,
  type ComplaintStatus,
} from "@/lib/grievance/status"
import type { Role } from "@/lib/roles"

export { TITLE_MAX_LENGTH, DESCRIPTION_MAX_LENGTH }

/** One complaint as every list screen renders it. */
export type ComplaintRow = {
  id: string
  reference: string
  title: string
  status: ComplaintStatus
  createdAt: Date
  updatedAt: Date
  citizenName: string
  citizenId: string
  departmentId: string | null
  departmentName: string | null
  priorityId: string | null
  priorityName: string | null
  prioritySeverity: number | null
  priorityColor: string | null
  assigneeId: string | null
  assigneeName: string | null
  duplicateOfId: string | null
  duplicateOfReference: string | null
  locationText: string | null
  imageCount: number
}

const citizen = aliasedTable(user, "citizen")
const assignee = aliasedTable(user, "assignee")
const original = aliasedTable(complaint, "original")

/** The column list every complaint listing shares. */
const listColumns = {
  id: complaint.id,
  reference: complaint.reference,
  title: complaint.title,
  status: complaint.status,
  createdAt: complaint.createdAt,
  updatedAt: complaint.updatedAt,
  citizenId: complaint.citizenId,
  citizenName: citizen.name,
  departmentId: complaint.departmentId,
  departmentName: department.name,
  priorityId: complaint.priorityId,
  priorityName: priority.name,
  prioritySeverity: priority.severity,
  priorityColor: priority.color,
  assigneeId: complaint.assigneeId,
  assigneeName: assignee.name,
  duplicateOfId: complaint.duplicateOfId,
  duplicateOfReference: original.reference,
  locationText: complaint.locationText,
  imageCount: sql<number>`(
    select count(*)::int from ${complaintImage}
    where ${complaintImage.complaintId} = ${complaint.id}
  )`,
}

function listQuery() {
  return db
    .select(listColumns)
    .from(complaint)
    .innerJoin(citizen, eq(complaint.citizenId, citizen.id))
    .leftJoin(department, eq(complaint.departmentId, department.id))
    .leftJoin(priority, eq(complaint.priorityId, priority.id))
    .leftJoin(assignee, eq(complaint.assigneeId, assignee.id))
    .leftJoin(original, eq(complaint.duplicateOfId, original.id))
}

function normalizeRow(row: Record<string, unknown>): ComplaintRow {
  return {
    ...(row as Omit<ComplaintRow, "status">),
    status: toComplaintStatus(row.status),
  }
}

export type ComplaintFilters = {
  status?: ComplaintStatus[]
  departmentId?: string
  priorityId?: string
  search?: string
  /** Only complaints with no department yet - the manual triage queue. */
  unassigned?: boolean
  limit?: number
}

/**
 * The scope a viewer is allowed to see, expressed as a SQL condition.
 *
 * Every listing runs through this, so a department user can never widen their
 * view by crafting a filter - the role condition is ANDed on top of whatever
 * they asked for.
 */
function scopeFor(viewer: { id: string; role: Role; departmentId: string | null }) {
  if (viewer.role === "admin") return undefined

  if (viewer.role === "department") {
    // No department assigned yet - they see nothing rather than everything.
    if (!viewer.departmentId) return sql`false`
    return eq(complaint.departmentId, viewer.departmentId)
  }

  return eq(complaint.citizenId, viewer.id)
}

export async function listComplaints(
  viewer: { id: string; role: Role; departmentId: string | null },
  filters: ComplaintFilters = {},
): Promise<ComplaintRow[]> {
  const conditions = [scopeFor(viewer)]

  if (filters.status?.length) {
    conditions.push(inArray(complaint.status, filters.status))
  }

  if (filters.departmentId) {
    conditions.push(eq(complaint.departmentId, filters.departmentId))
  }

  if (filters.priorityId) {
    conditions.push(eq(complaint.priorityId, filters.priorityId))
  }

  if (filters.unassigned) {
    conditions.push(isNull(complaint.departmentId))
  }

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`
    conditions.push(
      or(
        ilike(complaint.title, term),
        ilike(complaint.description, term),
        ilike(complaint.reference, term),
      ),
    )
  }

  const rows = await listQuery()
    .where(and(...conditions.filter(Boolean)))
    .orderBy(desc(complaint.createdAt))
    .limit(filters.limit ?? 200)

  return rows.map(normalizeRow)
}

export type ComplaintDetail = ComplaintRow & {
  description: string
  latitude: number | null
  longitude: number | null
  resolutionNote: string | null
  resolvedAt: Date | null
  departmentSource: string | null
  prioritySource: string | null
  citizenEmail: string
  images: { id: string; url: string; fileName: string }[]
}

/**
 * One complaint in full, or null when the viewer may not see it.
 *
 * Authorisation is folded into the query rather than checked afterwards, so
 * there is no path where the row is loaded and the check is forgotten.
 */
export async function loadComplaint(
  id: string,
  viewer: { id: string; role: Role; departmentId: string | null },
): Promise<ComplaintDetail | null> {
  const scope = scopeFor(viewer)

  const [row] = await db
    .select({
      ...listColumns,
      description: complaint.description,
      latitude: complaint.latitude,
      longitude: complaint.longitude,
      resolutionNote: complaint.resolutionNote,
      resolvedAt: complaint.resolvedAt,
      departmentSource: complaint.departmentSource,
      prioritySource: complaint.prioritySource,
      citizenEmail: citizen.email,
    })
    .from(complaint)
    .innerJoin(citizen, eq(complaint.citizenId, citizen.id))
    .leftJoin(department, eq(complaint.departmentId, department.id))
    .leftJoin(priority, eq(complaint.priorityId, priority.id))
    .leftJoin(assignee, eq(complaint.assigneeId, assignee.id))
    .leftJoin(original, eq(complaint.duplicateOfId, original.id))
    .where(and(eq(complaint.id, id), scope))
    .limit(1)

  if (!row) return null

  const imageRows = await db
    .select()
    .from(complaintImage)
    .where(eq(complaintImage.complaintId, id))
    .orderBy(complaintImage.createdAt)

  // Signed per request, so the URLs in a rendered page expire with it.
  const images = await Promise.all(
    imageRows.map(async (image) => ({
      id: image.id,
      fileName: image.fileName,
      url: await signedViewUrl(image.fileKey),
    })),
  )

  return { ...normalizeRow(row), images } as ComplaintDetail
}

/**
 * File a complaint.
 *
 * Returns as soon as the row and its photos are committed; triage runs
 * afterwards, because a citizen should not wait on two model calls to learn
 * their complaint was received.
 */
export async function createComplaint(values: {
  citizenId: string
  title: string
  description: string
  locationText?: string | null
  latitude?: number | null
  longitude?: number | null
  imageKeys?: string[]
}) {
  const id = randomUUID()
  const reference = newReference()

  const hasCoordinates = isValidCoordinate(values.latitude, values.longitude)

  await db.insert(complaint).values({
    id,
    reference,
    title: values.title.trim().slice(0, TITLE_MAX_LENGTH),
    description: values.description.trim().slice(0, DESCRIPTION_MAX_LENGTH),
    citizenId: values.citizenId,
    status: "submitted",
    locationText: values.locationText?.trim() || null,
    latitude: hasCoordinates ? values.latitude : null,
    longitude: hasCoordinates ? values.longitude : null,
    geohash: hasCoordinates
      ? cellFor(values.latitude as number, values.longitude as number)
      : null,
  })

  // Each key is verified against storage before it is trusted - the upload
  // happened out of band, so the client's word is not evidence.
  for (const key of values.imageKeys ?? []) {
    if (!key.startsWith(`complaints/${values.citizenId}/`)) continue

    const meta = await verifyUpload(key)
    if (!meta) continue

    await db.insert(complaintImage).values({
      id: randomUUID(),
      complaintId: id,
      fileKey: key,
      fileName: key.split("/").pop() ?? "photo",
      contentType: meta.contentType,
      size: meta.size,
    })
  }

  await recordEvent({
    complaintId: id,
    type: "created",
    actorId: values.citizenId,
    message: `Complaint ${reference} submitted.`,
    toStatus: "submitted",
  })

  // The citizen filed this themselves, so the in-app notification is
  // redundant on screen - but it is the receipt they keep, and it is what
  // carries the reference number to WhatsApp.
  await notify({
    userId: values.citizenId,
    complaintId: id,
    title: `Complaint ${reference} received`,
    body: `We have received "${values.title.trim().slice(0, TITLE_MAX_LENGTH)}" and are routing it to the right department. You can track it with the reference ${reference}.`,
  })

  return { id, reference }
}

/** Change a complaint's status, recording the transition and telling the citizen. */
export async function changeStatus(values: {
  complaintId: string
  actorId: string
  to: ComplaintStatus
  note?: string | null
  resolutionNote?: string | null
}) {
  const [row] = await db
    .select({
      status: complaint.status,
      reference: complaint.reference,
      citizenId: complaint.citizenId,
    })
    .from(complaint)
    .where(eq(complaint.id, values.complaintId))
    .limit(1)

  if (!row) return

  const from = toComplaintStatus(row.status)

  await db
    .update(complaint)
    .set({
      status: values.to,
      resolutionNote: values.resolutionNote ?? undefined,
      resolvedAt: values.to === "resolved" ? new Date() : null,
    })
    .where(eq(complaint.id, values.complaintId))

  await recordEvent({
    complaintId: values.complaintId,
    type: values.to === "resolved" ? "resolved" : "status_changed",
    actorId: values.actorId,
    message: `Status changed from ${from.replace("_", " ")} to ${values.to.replace("_", " ")}.`,
    note: values.resolutionNote ?? values.note ?? null,
    fromStatus: from,
    toStatus: values.to,
  })

  await notify({
    userId: row.citizenId,
    complaintId: values.complaintId,
    title: `${row.reference} is now ${values.to.replace("_", " ")}`,
    body:
      values.resolutionNote ??
      values.note ??
      `Your complaint moved from ${from.replace("_", " ")} to ${values.to.replace("_", " ")}.`,
  })
}

/** Route a complaint to a department, overriding whatever the AI decided. */
export async function assignDepartment(values: {
  complaintId: string
  departmentId: string
  actorId: string
  source: "admin" | "department"
}) {
  const [target] = await db
    .select({ name: department.name })
    .from(department)
    .where(eq(department.id, values.departmentId))
    .limit(1)

  if (!target) return

  await db
    .update(complaint)
    .set({
      departmentId: values.departmentId,
      departmentSource: values.source,
      // Rerouting drops the previous owner - the new department must accept it
      // themselves, so the complaint returns to "triaged" rather than staying
      // "assigned" to someone who no longer has it.
      assigneeId: null,
      status: sql`case when ${complaint.status} in ('submitted','assigned','in_progress') then 'triaged' else ${complaint.status} end`,
    })
    .where(eq(complaint.id, values.complaintId))

  await recordEvent({
    complaintId: values.complaintId,
    type: "reassigned",
    actorId: values.actorId,
    message: `Routed to ${target.name}.`,
  })
}

export async function setPriority(values: {
  complaintId: string
  priorityId: string
  actorId: string
  source: "admin" | "department"
}) {
  const [target] = await db
    .select({ name: priority.name })
    .from(priority)
    .where(eq(priority.id, values.priorityId))
    .limit(1)

  if (!target) return

  await db
    .update(complaint)
    .set({ priorityId: values.priorityId, prioritySource: values.source })
    .where(eq(complaint.id, values.complaintId))

  await recordEvent({
    complaintId: values.complaintId,
    type: "override",
    actorId: values.actorId,
    message: `Priority set to ${target.name}.`,
  })
}

/**
 * A department user takes ownership of a complaint in their queue.
 *
 * This is what "assigned" means - a named person has it. Work only becomes
 * "in progress" when they say so, because accepting a complaint and having
 * started on it are different claims to make to a citizen.
 */
export async function acceptComplaint(complaintId: string, actorId: string) {
  await db
    .update(complaint)
    .set({
      assigneeId: actorId,
      status: sql`case when ${complaint.status} in ('submitted','triaged') then 'assigned' else ${complaint.status} end`,
    })
    .where(eq(complaint.id, complaintId))

  await recordEvent({
    complaintId,
    type: "assigned",
    actorId,
    message: "Accepted by the department.",
    toStatus: "assigned",
  })

  // Read after the update, so the department name reflects the row as it now
  // stands rather than as it was before anyone claimed it.
  const [row] = await db
    .select({
      citizenId: complaint.citizenId,
      reference: complaint.reference,
      departmentName: department.name,
    })
    .from(complaint)
    .leftJoin(department, eq(complaint.departmentId, department.id))
    .where(eq(complaint.id, complaintId))
    .limit(1)

  if (!row) return

  // The assignee is named on the complaint page but deliberately not in the
  // message - a citizen needs to know a team owns it, not which individual,
  // and staff names do not belong in an outbound channel.
  await notify({
    userId: row.citizenId,
    complaintId,
    title: `${row.reference} has been accepted`,
    body: row.departmentName
      ? `${row.departmentName} has accepted your complaint and taken ownership of it. You will hear again when work starts.`
      : "A department has accepted your complaint and taken ownership of it. You will hear again when work starts.",
  })
}

export async function addRemark(values: {
  complaintId: string
  actorId: string
  note: string
  internal: boolean
}) {
  await recordEvent({
    complaintId: values.complaintId,
    type: "remark",
    actorId: values.actorId,
    message: values.internal ? "Internal remark added." : "Update added.",
    note: values.note,
    internal: values.internal,
  })

  if (values.internal) return

  const [row] = await db
    .select({ citizenId: complaint.citizenId, reference: complaint.reference })
    .from(complaint)
    .where(eq(complaint.id, values.complaintId))
    .limit(1)

  if (!row) return

  await notify({
    userId: row.citizenId,
    complaintId: values.complaintId,
    title: `Update on ${row.reference}`,
    body: values.note,
  })
}

/** Mark or clear a duplicate link by hand, overriding the AI. */
export async function setDuplicate(values: {
  complaintId: string
  duplicateOfId: string | null
  actorId: string
}) {
  await db
    .update(complaint)
    .set({ duplicateOfId: values.duplicateOfId })
    .where(eq(complaint.id, values.complaintId))

  await recordEvent({
    complaintId: values.complaintId,
    type: "override",
    actorId: values.actorId,
    message: values.duplicateOfId
      ? "Marked as a duplicate of an existing complaint."
      : "Duplicate link removed.",
  })
}

/** How many complaints a citizen has filed, for the dashboard tallies. */
export async function countByStatus(
  viewer: { id: string; role: Role; departmentId: string | null },
) {
  const rows = await db
    .select({ status: complaint.status, total: count() })
    .from(complaint)
    .where(and(scopeFor(viewer)))
    .groupBy(complaint.status)

  const tally: Record<string, number> = {}
  for (const row of rows) tally[row.status] = row.total

  return tally
}
