import "server-only"

import { and, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { aiDecision, complaint, department, priority, user } from "@/lib/db/schema"
import { cellCenter } from "@/lib/grievance/geo"
import { OPEN_STATUSES } from "@/lib/grievance/status"
import type { Role } from "@/lib/roles"

/** Restrict every analytic to what this viewer is allowed to count. */
function scope(viewer: { id: string; role: Role; departmentId: string | null }) {
  if (viewer.role === "admin") return undefined
  if (viewer.role === "department") {
    return viewer.departmentId
      ? eq(complaint.departmentId, viewer.departmentId)
      : sql`false`
  }
  return eq(complaint.citizenId, viewer.id)
}

export type Overview = {
  total: number
  open: number
  inProgress: number
  resolved: number
  unrouted: number
  duplicates: number
  /** Mean hours from submission to resolution, over resolved complaints. */
  avgResolutionHours: number | null
  /** Resolved in the last 30 days, as a share of those created then. */
  resolutionRate: number | null
}

export async function loadOverview(viewer: {
  id: string
  role: Role
  departmentId: string | null
}): Promise<Overview> {
  const where = scope(viewer)

  const [row] = await db
    .select({
      total: count(),
      open: sql<number>`count(*) filter (where ${complaint.status} in ('submitted','triaged','assigned','in_progress'))::int`,
      inProgress: sql<number>`count(*) filter (where ${complaint.status} = 'in_progress')::int`,
      resolved: sql<number>`count(*) filter (where ${complaint.status} = 'resolved')::int`,
      unrouted: sql<number>`count(*) filter (where ${complaint.departmentId} is null)::int`,
      duplicates: sql<number>`count(*) filter (where ${complaint.duplicateOfId} is not null)::int`,
      avgResolutionHours: sql<number | null>`
        avg(extract(epoch from (${complaint.resolvedAt} - ${complaint.createdAt})) / 3600)
        filter (where ${complaint.resolvedAt} is not null)
      `,
    })
    .from(complaint)
    .where(where)

  const total = row?.total ?? 0
  const resolved = row?.resolved ?? 0

  return {
    total,
    open: row?.open ?? 0,
    inProgress: row?.inProgress ?? 0,
    resolved,
    unrouted: row?.unrouted ?? 0,
    duplicates: row?.duplicates ?? 0,
    avgResolutionHours: row?.avgResolutionHours ?? null,
    resolutionRate: total > 0 ? resolved / total : null,
  }
}

/** Daily counts for the trend chart, zero-filled so the line has no gaps. */
export async function loadTrend(
  viewer: { id: string; role: Role; departmentId: string | null },
  days = 90,
) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${complaint.createdAt}), 'YYYY-MM-DD')`,
      submitted: count(),
      resolved: sql<number>`count(*) filter (where ${complaint.status} = 'resolved')::int`,
    })
    .from(complaint)
    .where(and(gte(complaint.createdAt, since), scope(viewer)))
    .groupBy(sql`date_trunc('day', ${complaint.createdAt})`)
    .orderBy(sql`date_trunc('day', ${complaint.createdAt})`)

  const byDay = new Map(rows.map((row) => [row.day, row]))
  const series: { date: string; submitted: number; resolved: number }[] = []

  for (let index = days - 1; index >= 0; index--) {
    const date = new Date(Date.now() - index * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const row = byDay.get(date)

    series.push({
      date,
      submitted: row?.submitted ?? 0,
      resolved: row?.resolved ?? 0,
    })
  }

  return series
}

/** Workload per department - what the admin dashboard ranks teams by. */
export async function loadDepartmentWorkload() {
  return db
    .select({
      id: department.id,
      name: department.name,
      total: count(complaint.id),
      open: sql<number>`count(*) filter (where ${complaint.status} in ('submitted','triaged','assigned','in_progress'))::int`,
      resolved: sql<number>`count(*) filter (where ${complaint.status} = 'resolved')::int`,
      avgResolutionHours: sql<number | null>`
        avg(extract(epoch from (${complaint.resolvedAt} - ${complaint.createdAt})) / 3600)
        filter (where ${complaint.resolvedAt} is not null)
      `,
    })
    .from(department)
    .leftJoin(complaint, eq(complaint.departmentId, department.id))
    .where(eq(department.active, true))
    .groupBy(department.id, department.name)
    .orderBy(desc(count(complaint.id)))
}

/** The priority mix, for the dashboard breakdown. */
export async function loadPriorityBreakdown(viewer: {
  id: string
  role: Role
  departmentId: string | null
}) {
  return db
    .select({
      id: priority.id,
      name: priority.name,
      color: priority.color,
      severity: priority.severity,
      total: count(complaint.id),
      open: sql<number>`count(*) filter (where ${complaint.status} in ('submitted','triaged','assigned','in_progress'))::int`,
    })
    .from(priority)
    .leftJoin(
      complaint,
      and(eq(complaint.priorityId, priority.id), scope(viewer)),
    )
    .groupBy(priority.id, priority.name, priority.color, priority.severity)
    .orderBy(desc(priority.severity))
}

/**
 * Geographic clusters - Phase 4's hotspots, on the coarse grid from geo.ts.
 *
 * Only cells with more than one complaint are returned: a single report is a
 * complaint, not a hotspot.
 */
export async function loadHotspots(limit = 12) {
  const rows = await db
    .select({
      cell: complaint.geohash,
      total: count(),
      open: sql<number>`count(*) filter (where ${complaint.status} in ('submitted','triaged','assigned','in_progress'))::int`,
      sample: sql<string>`min(${complaint.locationText})`,
    })
    .from(complaint)
    .where(isNotNull(complaint.geohash))
    .groupBy(complaint.geohash)
    .having(sql`count(*) > 1`)
    .orderBy(desc(count()))
    .limit(limit)

  return rows.flatMap((row) => {
    const center = cellCenter(row.cell ?? null)

    if (center.latitude === null || center.longitude === null) {
      return []
    }

    return [{
      ...row,
      ...center,
    }]
  })
}

/**
 * Complaints that recur - the same underlying issue reported repeatedly.
 *
 * Ranked by how many duplicates point at each original, which is exactly the
 * "recurring issue" signal Phase 3 asks for, available already because the
 * duplicate pass writes the link.
 */
export async function loadRecurring(limit = 10) {
  const duplicate = sql`${complaint.duplicateOfId}`

  return db
    .select({
      id: complaint.duplicateOfId,
      reports: count(),
    })
    .from(complaint)
    .where(isNotNull(complaint.duplicateOfId))
    .groupBy(duplicate)
    .orderBy(desc(count()))
    .limit(limit)
}

export type AiDecisionRow = {
  id: string
  complaintId: string
  reference: string
  kind: string
  outcomeLabel: string | null
  confidence: number
  reason: string
  model: string | null
  overridden: boolean
  createdAt: Date
}

export async function listAiDecisions(limit = 100): Promise<AiDecisionRow[]> {
  return db
    .select({
      id: aiDecision.id,
      complaintId: aiDecision.complaintId,
      reference: complaint.reference,
      kind: aiDecision.kind,
      outcomeLabel: aiDecision.outcomeLabel,
      confidence: aiDecision.confidence,
      reason: aiDecision.reason,
      model: aiDecision.model,
      overridden: aiDecision.overridden,
      createdAt: aiDecision.createdAt,
    })
    .from(aiDecision)
    .innerJoin(complaint, eq(aiDecision.complaintId, complaint.id))
    .orderBy(desc(aiDecision.createdAt))
    .limit(limit)
}

/** Headline AI numbers for the configuration screen. */
export async function loadAiStats() {
  const [row] = await db
    .select({
      total: count(),
      avgConfidence: sql<number | null>`avg(${aiDecision.confidence})`,
      overridden: sql<number>`count(*) filter (where ${aiDecision.overridden})::int`,
      lowConfidence: sql<number>`count(*) filter (where ${aiDecision.confidence} < 0.55)::int`,
    })
    .from(aiDecision)

  return {
    total: row?.total ?? 0,
    avgConfidence: row?.avgConfidence ?? null,
    overridden: row?.overridden ?? 0,
    lowConfidence: row?.lowConfidence ?? 0,
  }
}
