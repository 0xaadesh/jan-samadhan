/**
 * Whether a complaint is still being triaged.
 *
 * Derived rather than stored. Triage runs detached from the submission
 * request, so there is a window - usually a few seconds - where the row exists
 * but has no department or priority. A `triaging` boolean column would have to
 * be written twice more per complaint and could be left stuck `true` forever
 * by a crash; this expression cannot go stale, because it is a description of
 * the row rather than a claim about a background job.
 *
 * Shared by server and client, so this file must stay free of `server-only`.
 */

import type { ComplaintStatus } from "@/lib/grievance/status"

/**
 * How long after submission we keep showing a spinner.
 *
 * Past this the pipeline has either finished, been disabled, or failed - and
 * an honest "not routed" beats a spinner that never resolves.
 */
const TRIAGE_GRACE_MS = 90 * 1000

export function isTriaging(complaint: {
  status: ComplaintStatus
  departmentId: string | null
  priorityId: string | null
  createdAt: Date | string
}) {
  // Once either field lands, the pass has produced something - stop waiting.
  if (complaint.departmentId || complaint.priorityId) return false

  // A complaint a human has already moved on is not awaiting triage.
  if (complaint.status !== "submitted") return false

  const age = Date.now() - new Date(complaint.createdAt).getTime()

  return age < TRIAGE_GRACE_MS
}

/** Milliseconds until this complaint stops counting as triaging. */
export function triageTimeRemaining(createdAt: Date | string) {
  const age = Date.now() - new Date(createdAt).getTime()
  return Math.max(0, TRIAGE_GRACE_MS - age)
}
