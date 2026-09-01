/**
 * The lifecycle of one complaint, and the priority severity scale.
 *
 * Statuses are code-defined because each one gates a transition and a piece of
 * UI; priorities are *not* - those are rows an admin creates, because the
 * strategy calls for configurable priority levels. What is fixed here is only
 * the 1-5 severity a priority is ranked by.
 */

export const COMPLAINT_STATUSES = [
  "submitted",
  "triaged",
  "assigned",
  "in_progress",
  "resolved",
  "rejected",
] as const

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number]

export const DEFAULT_STATUS: ComplaintStatus = "submitted"

export type StatusInfo = {
  label: string
  description: string
  /** Drives the badge colour, using the shared semantic tokens. */
  tone: "neutral" | "info" | "active" | "success" | "danger"
  /** Whether the complaint is finished - no further transitions offered. */
  terminal: boolean
}

export const STATUS_INFO: Record<ComplaintStatus, StatusInfo> = {
  submitted: {
    label: "Submitted",
    description: "Received, waiting on the AI triage pass.",
    tone: "neutral",
    terminal: false,
  },
  triaged: {
    label: "Triaged",
    description:
      "Routed to a department and ranked, waiting for that department to accept it.",
    tone: "info",
    terminal: false,
  },
  assigned: {
    label: "Assigned",
    description: "A department user has accepted it and owns the work.",
    tone: "info",
    terminal: false,
  },
  in_progress: {
    label: "In progress",
    description: "A department user is actively working on it.",
    tone: "active",
    terminal: false,
  },
  resolved: {
    label: "Resolved",
    description: "Work is complete and a resolution was recorded.",
    tone: "success",
    terminal: true,
  },
  rejected: {
    label: "Rejected",
    description: "Closed without action - out of scope, or a duplicate.",
    tone: "danger",
    terminal: true,
  },
}

/**
 * The statuses a department user may move a complaint to from where it is now.
 *
 * Only the owning department drives this. `submitted` and `triaged` are absent
 * as *sources* of a manual move because the way out of them is accepting the
 * complaint, not picking a status - which is what makes "assigned" mean a real
 * person has taken it rather than merely that routing happened.
 *
 * Deliberately permissive in the backward direction: real cases get reopened,
 * and a wrongly-resolved complaint should not need a database edit to un-stick.
 */
export function nextStatuses(from: ComplaintStatus): ComplaintStatus[] {
  switch (from) {
    // Before acceptance there is one move, and it is the Accept button.
    case "submitted":
    case "triaged":
      return []
    case "assigned":
      return ["in_progress", "resolved", "rejected"]
    case "in_progress":
      return ["resolved", "rejected"]
    case "resolved":
    case "rejected":
      return ["in_progress"]
  }
}

/**
 * Whether a complaint is routed but nobody has taken it on yet.
 *
 * This is the gap the department's Accept button closes, and the reason an
 * admin sees "awaiting acceptance" rather than a set of buttons.
 */
export function isAwaitingAcceptance(
  status: ComplaintStatus,
  assigneeId: string | null,
) {
  return assigneeId === null && (status === "submitted" || status === "triaged")
}

export function toComplaintStatus(value: unknown): ComplaintStatus {
  return COMPLAINT_STATUSES.includes(value as ComplaintStatus)
    ? (value as ComplaintStatus)
    : DEFAULT_STATUS
}

/** Statuses that count as "open" in every dashboard tally. */
export const OPEN_STATUSES: ComplaintStatus[] = [
  "submitted",
  "triaged",
  "assigned",
  "in_progress",
]

/** The 1-5 scale an admin ranks their priority levels on. */
export const SEVERITY_MIN = 1
export const SEVERITY_MAX = 5

export const SEVERITY_LABELS: Record<number, string> = {
  1: "Lowest",
  2: "Low",
  3: "Medium",
  4: "High",
  5: "Critical",
}

export function clampSeverity(value: number) {
  if (!Number.isFinite(value)) return 3
  return Math.min(SEVERITY_MAX, Math.max(SEVERITY_MIN, Math.round(value)))
}
