"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { aiDecision, complaint, user } from "@/lib/db/schema"
import { requireAdmin, requireStaff, requireViewer } from "@/lib/auth-session"
import {
  acceptComplaint,
  addRemark,
  assignDepartment,
  changeStatus,
  createComplaint,
  listComplaints,
  loadComplaint,
  setDuplicate,
  setPriority,
} from "@/lib/grievance/complaints"
import {
  createDepartment,
  createPriority,
  countOtherAdmins,
  deleteDepartment,
  deletePriority,
  setUserActive,
  setUserRole,
  updateDepartment,
  updatePriority,
} from "@/lib/grievance/admin"
import { loadTimeline, markAllRead, markRead } from "@/lib/grievance/events"
import { writeSettings, type PlatformSettings } from "@/lib/grievance/settings"
import {
  isAllowedImageType,
  isStorageConfigured,
  MAX_IMAGES_PER_COMPLAINT,
  presignUpload,
} from "@/lib/grievance/storage"
import { verifyComplaintImage } from "@/lib/grievance/image-check"
import { findSimilarComplaints, triageComplaint } from "@/lib/grievance/triage"
import { STATUS_INFO, toComplaintStatus } from "@/lib/grievance/status"
import { toRole } from "@/lib/roles"
import { normalizePhone } from "@/lib/grievance/whatsapp"

/* -------------------------------------------------------------------------- */
/* Citizen                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Mint a presigned PUT so the browser can upload a photo straight to storage.
 *
 * The content type is checked here rather than trusted from the upload, and
 * the key is generated server-side under the caller's own prefix.
 */
export async function presignComplaintImageAction(
  fileName: string,
  contentType: string,
) {
  const viewer = await requireViewer()

  if (!isStorageConfigured()) {
    throw new Error("Image uploads are not configured on this deployment.")
  }

  if (!isAllowedImageType(contentType)) {
    throw new Error("Only JPEG, PNG, WebP and HEIC photos can be attached.")
  }

  return presignUpload({ contentType, fileName, userId: viewer.id })
}

/**
 * Check the attached photos actually show the problem being reported.
 *
 * Called by the form before it submits, so a citizen who picked the wrong file
 * is told on the form rather than after a complaint already exists. It is also
 * re-run inside `submitComplaintAction`, because a client-side gate is a
 * courtesy and not a check - the action is callable directly.
 *
 * Keys are filtered to the caller's own prefix first: without that, a caller
 * could point this at another citizen's evidence and have the model describe
 * it back to them.
 */
export async function verifyComplaintImagesAction(input: {
  title: string
  description: string
  imageKeys: string[]
}) {
  const viewer = await requireViewer()

  const keys = input.imageKeys
    .filter((key) => key.startsWith(`complaints/${viewer.id}/`))
    .slice(0, MAX_IMAGES_PER_COMPLAINT)

  if (keys.length === 0) return { ok: true, rejected: [] }

  // In parallel: five photos checked one after another is five round trips a
  // citizen waits through with the submit button disabled.
  const verdicts = await Promise.all(
    keys.map(async (key) => ({
      key,
      verdict: await verifyComplaintImage({
        key,
        title: input.title,
        description: input.description,
      }),
    })),
  )

  const rejected = verdicts
    .filter((entry) => !entry.verdict.ok)
    .map((entry) => ({ key: entry.key, message: entry.verdict.message }))

  return { ok: rejected.length === 0, rejected }
}

/**
 * The open complaints a draft looks like a restatement of.
 *
 * Called by the form before it submits, so a citizen re-reporting something
 * they already filed sees it while they can still change their mind, rather
 * than discovering a "duplicate of" badge on a complaint that already exists.
 *
 * Deliberately advisory: unlike the photo check, this never blocks. Two
 * genuinely separate potholes on the same street read almost identically, and
 * refusing the second one would lose a real complaint. The form warns once and
 * lets the citizen file anyway - `submitComplaintAction` does not re-run this
 * as a gate, because there is nothing here to enforce.
 */
export async function findSimilarComplaintsAction(input: {
  title: string
  description: string
}) {
  await requireViewer()

  if (!input.title.trim() || !input.description.trim()) return []

  const matches = await findSimilarComplaints({
    title: input.title,
    description: input.description,
  })

  return matches.map((match) => ({
    id: match.id,
    reference: match.reference,
    title: match.title,
    status: match.status,
    createdAt: match.createdAt,
    similarity: match.similarity,
  }))
}

export async function submitComplaintAction(input: {
  title: string
  description: string
  locationText?: string
  latitude?: number | null
  longitude?: number | null
  imageKeys?: string[]
}) {
  const viewer = await requireViewer()

  if (!input.title.trim() || !input.description.trim()) {
    throw new Error("A title and description are required.")
  }

  const imageKeys = (input.imageKeys ?? []).slice(0, MAX_IMAGES_PER_COMPLAINT)

  // The form checks this first so the citizen sees the problem inline, but the
  // action is directly callable, so the gate has to live here too.
  if (imageKeys.length > 0) {
    const check = await verifyComplaintImagesAction({
      title: input.title,
      description: input.description,
      imageKeys,
    })

    if (!check.ok) {
      throw new Error(
        check.rejected[0]?.message ??
          "One of the attached photos does not match the problem described.",
      )
    }
  }

  const { id, reference } = await createComplaint({
    citizenId: viewer.id,
    title: input.title,
    description: input.description,
    locationText: input.locationText,
    latitude: input.latitude,
    longitude: input.longitude,
    imageKeys,
  })

  // Deliberately not awaited: triage is an embedding plus a model call, and
  // the citizen should get their reference number now. Every failure inside is
  // recorded rather than thrown, so this cannot reject into a dead request.
  void triageComplaint(id)

  revalidatePath("/complaints")
  revalidatePath("/dashboard")

  return { id, reference }
}

/* -------------------------------------------------------------------------- */
/* Citizen - voice assistant                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The complaints this citizen has filed, for the voice assistant to read out.
 *
 * The written assistant answers this inside its route, where it already has a
 * verified viewer. The voice session runs in the browser against OpenAI
 * directly, so its tools need a server entry point of their own - and it has
 * to re-derive the viewer rather than accept an id, or the tool would be an
 * unauthenticated read of anyone's complaints.
 *
 * Deliberately narrow: `listComplaints` scopes to the caller, and only the
 * fields worth saying aloud are returned.
 */
export async function listMyComplaintsAction(limit: number) {
  const viewer = await requireViewer()

  if (viewer.role !== "citizen") {
    throw new Error("The assistant is available to citizens only.")
  }

  const rows = await listComplaints(viewer, {
    limit: Math.min(Math.max(Math.trunc(limit) || 5, 1), 20),
  })

  return rows.map((entry) => ({
    reference: entry.reference,
    title: entry.title,
    status: STATUS_INFO[entry.status].label,
    department: entry.departmentName,
    priority: entry.priorityName,
    filedOn: entry.createdAt.toISOString().slice(0, 10),
  }))
}

/**
 * One complaint's status and timeline, by reference.
 *
 * `listComplaints` applies the citizen scope itself, so a reference belonging
 * to someone else simply is not found - the tool cannot be talked into reading
 * another person's complaint.
 */
export async function getComplaintStatusAction(reference: string) {
  const viewer = await requireViewer()

  if (viewer.role !== "citizen") {
    throw new Error("The assistant is available to citizens only.")
  }

  const wanted = reference.trim()

  const matches = await listComplaints(viewer, { search: wanted, limit: 5 })

  const match = matches.find(
    (entry) => entry.reference.toLowerCase() === wanted.toLowerCase(),
  )

  const detail = match ? await loadComplaint(match.id, viewer) : null

  if (!detail) {
    return {
      found: false as const,
      message: `No complaint of yours has the reference ${wanted}.`,
    }
  }

  const timeline = await loadTimeline(detail.id, false)

  return {
    found: true as const,
    reference: detail.reference,
    title: detail.title,
    status: STATUS_INFO[detail.status].label,
    department: detail.departmentName,
    priority: detail.priorityName,
    filedOn: detail.createdAt.toISOString().slice(0, 10),
    resolutionNote: detail.resolutionNote,
    duplicateOf: detail.duplicateOfReference,
    timeline: timeline.map((entry) => ({
      on: entry.createdAt.toISOString().slice(0, 10),
      what: entry.message,
    })),
  }
}

/**
 * Save the citizen's WhatsApp contact preferences.
 *
 * The toggle cannot be turned on without a usable number - otherwise the UI
 * would show "on" while nothing could ever be delivered, which reads as a
 * broken feature rather than an incomplete setup.
 */
export async function updateWhatsAppSettingsAction(input: {
  phone: string
  enabled: boolean
}) {
  const viewer = await requireViewer()

  const trimmed = input.phone.trim()
  const phone = trimmed ? normalizePhone(trimmed) : null

  if (trimmed && !phone) {
    throw new Error(
      "That does not look like a phone number. Include the country code, for example 918097920998.",
    )
  }

  if (input.enabled && !phone) {
    throw new Error("Add a phone number before turning WhatsApp updates on.")
  }

  await db
    .update(user)
    .set({ phone, whatsappNotifications: input.enabled })
    .where(eq(user.id, viewer.id))

  revalidatePath("/dashboard")

  return { phone: phone ?? "", enabled: input.enabled }
}

export async function markNotificationReadAction(id: string) {
  const viewer = await requireViewer()
  await markRead(id, viewer.id)
  revalidatePath("/notifications")
}

export async function markAllNotificationsReadAction() {
  const viewer = await requireViewer()
  await markAllRead(viewer.id)
  revalidatePath("/notifications")
}

/* -------------------------------------------------------------------------- */
/* Staff - department users and admins                                         */
/* -------------------------------------------------------------------------- */

/** Confirm a staff member may act on this specific complaint. */
async function requireComplaintAccess(complaintId: string) {
  const viewer = await requireStaff()

  if (viewer.role === "admin") return viewer

  const [row] = await db
    .select({ departmentId: complaint.departmentId })
    .from(complaint)
    .where(eq(complaint.id, complaintId))
    .limit(1)

  // A department user may only touch their own queue - including the unrouted
  // pile, which anyone may claim.
  if (row && row.departmentId && row.departmentId !== viewer.departmentId) {
    throw new Error("That complaint belongs to another department.")
  }

  return viewer
}

/**
 * Take ownership of a complaint.
 *
 * Department users only. An admin routes work to a department and oversees it;
 * letting them put their own name in the assignee column would make the
 * platform's own workload figures lie, since an admin belongs to no department
 * and their queue is not a queue anyone reports on.
 *
 * Enforced here rather than only in the UI - hiding a button is a courtesy,
 * not an authorisation check.
 */
export async function acceptComplaintAction(complaintId: string) {
  const viewer = await requireComplaintAccess(complaintId)

  if (viewer.role !== "department") {
    throw new Error(
      "Only department users can take ownership of a complaint. Route it to a department instead.",
    )
  }

  await acceptComplaint(complaintId, viewer.id)
  revalidatePath(`/complaints/${complaintId}`)
  revalidatePath("/complaints")
}

/**
 * Move a complaint through its lifecycle.
 *
 * Department users only. An admin oversees and routes; the department that
 * holds the work is the only party that can honestly say it has started or
 * finished, so letting an admin close a complaint would put a resolution note
 * on the record that nobody actually stands behind.
 */
export async function changeStatusAction(
  complaintId: string,
  status: string,
  note?: string,
) {
  const viewer = await requireComplaintAccess(complaintId)

  if (viewer.role !== "department") {
    throw new Error(
      "Only the department handling this complaint can change its status.",
    )
  }

  const next = toComplaintStatus(status)

  await changeStatus({
    complaintId,
    actorId: viewer.id,
    to: next,
    resolutionNote: next === "resolved" ? note?.trim() || null : null,
    note: next === "resolved" ? null : note?.trim() || null,
  })

  revalidatePath(`/complaints/${complaintId}`)
  revalidatePath("/complaints")
  revalidatePath("/dashboard")
}

export async function addRemarkAction(
  complaintId: string,
  note: string,
  internal: boolean,
) {
  const viewer = await requireComplaintAccess(complaintId)

  if (!note.trim()) throw new Error("A remark cannot be empty.")

  await addRemark({
    complaintId,
    actorId: viewer.id,
    note: note.trim(),
    internal,
  })

  revalidatePath(`/complaints/${complaintId}`)
}

/**
 * Override the AI's routing.
 *
 * The decision rows are flagged rather than deleted, so the AI log keeps
 * showing what was decided and that a human disagreed - which is the signal an
 * admin needs to judge whether the classifier is working.
 */
export async function overrideDepartmentAction(
  complaintId: string,
  departmentId: string,
) {
  const viewer = await requireComplaintAccess(complaintId)

  // Routing between departments is an admin decision. A department that could
  // reassign its own work could quietly push a complaint it did not want onto
  // someone else, which is exactly what the escalation path is for.
  if (viewer.role !== "admin") {
    throw new Error(
      "Only an admin can route a complaint to a different department.",
    )
  }

  await assignDepartment({
    complaintId,
    departmentId,
    actorId: viewer.id,
    source: "admin",
  })

  await flagOverridden(complaintId, "classification")

  revalidatePath(`/complaints/${complaintId}`)
  revalidatePath("/complaints")
}

export async function overridePriorityAction(
  complaintId: string,
  priorityId: string,
) {
  const viewer = await requireComplaintAccess(complaintId)

  await setPriority({
    complaintId,
    priorityId,
    actorId: viewer.id,
    source: viewer.role === "admin" ? "admin" : "department",
  })

  await flagOverridden(complaintId, "prioritization")

  revalidatePath(`/complaints/${complaintId}`)
  revalidatePath("/complaints")
}

export async function clearDuplicateAction(complaintId: string) {
  const viewer = await requireComplaintAccess(complaintId)

  await setDuplicate({ complaintId, duplicateOfId: null, actorId: viewer.id })
  await flagOverridden(complaintId, "duplicate")

  revalidatePath(`/complaints/${complaintId}`)
}

async function flagOverridden(
  complaintId: string,
  kind: "classification" | "prioritization" | "duplicate",
) {
  await db
    .update(aiDecision)
    .set({ overridden: true })
    .where(
      and(eq(aiDecision.complaintId, complaintId), eq(aiDecision.kind, kind)),
    )
}

/* -------------------------------------------------------------------------- */
/* Admin                                                                       */
/* -------------------------------------------------------------------------- */

export async function createDepartmentAction(name: string, description: string) {
  await requireAdmin()

  if (!name.trim() || !description.trim()) {
    throw new Error("A department needs a name and a description.")
  }

  await createDepartment({ name, description })
  revalidatePath("/admin/departments")
}

export async function updateDepartmentAction(
  id: string,
  name: string,
  description: string,
  active: boolean,
) {
  await requireAdmin()
  await updateDepartment(id, { name, description, active })
  revalidatePath("/admin/departments")
}

export async function deleteDepartmentAction(id: string) {
  await requireAdmin()
  await deleteDepartment(id)
  revalidatePath("/admin/departments")
}

export async function createPriorityAction(input: {
  name: string
  description: string
  severity: number
  slaHours: number | null
  color: string
}) {
  await requireAdmin()

  if (!input.name.trim()) throw new Error("A priority level needs a name.")

  await createPriority(input)
  revalidatePath("/admin/priorities")
}

export async function updatePriorityAction(
  id: string,
  input: {
    name: string
    description: string
    severity: number
    slaHours: number | null
    color: string
    active: boolean
  },
) {
  await requireAdmin()
  await updatePriority(id, input)
  revalidatePath("/admin/priorities")
}

export async function deletePriorityAction(id: string) {
  await requireAdmin()
  await deletePriority(id)
  revalidatePath("/admin/priorities")
}

/**
 * Change someone's role.
 *
 * Refuses to remove the last admin: an empty admin set locks everyone out of
 * user management permanently, recoverable only by the make-admin script.
 */
export async function setUserRoleAction(
  userId: string,
  role: string,
  departmentId: string | null,
) {
  await requireAdmin()
  const next = toRole(role)

  if (next !== "admin" && (await countOtherAdmins(userId)) === 0) {
    throw new Error(
      "This is the only admin account - promote someone else before changing it.",
    )
  }

  if (next === "department" && !departmentId) {
    throw new Error("A department user must be assigned to a department.")
  }

  await setUserRole(userId, next, departmentId)
  revalidatePath("/admin/users")
}

export async function setUserActiveAction(userId: string, active: boolean) {
  const viewer = await requireAdmin()

  if (userId === viewer.id) {
    throw new Error("You cannot disable your own account.")
  }

  if (!active && (await countOtherAdmins(userId)) === 0) {
    throw new Error("This is the only admin account - it cannot be disabled.")
  }

  await setUserActive(userId, active)
  revalidatePath("/admin/users")
}

export async function updateSettingsAction(values: Partial<PlatformSettings>) {
  await requireAdmin()
  await writeSettings(values)
  revalidatePath("/admin/ai")
}

/** Re-run the AI pipeline for one complaint, after a settings or catalogue change. */
export async function retriageAction(complaintId: string) {
  await requireAdmin()
  await triageComplaint(complaintId)
  revalidatePath(`/complaints/${complaintId}`)
}
