import "server-only"

import { randomUUID } from "node:crypto"
import { and, desc, eq, isNull, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { complaintEvent, notification, user } from "@/lib/db/schema"
import type { ComplaintStatus } from "@/lib/grievance/status"
import { isWhatsAppConfigured, sendWhatsApp } from "@/lib/grievance/whatsapp"

/** Mirrors the `event_type` pg enum; the database rejects anything else. */
export type EventType =
  | "created"
  | "status_changed"
  | "assigned"
  | "reassigned"
  | "remark"
  | "ai_triage"
  | "override"
  | "resolved"

/**
 * Append one entry to a complaint's timeline.
 *
 * Every mutation goes through here rather than writing the table directly, so
 * there is exactly one place that decides what the history looks like.
 */
export async function recordEvent(values: {
  complaintId: string
  type: EventType
  message: string
  actorId?: string | null
  note?: string | null
  fromStatus?: ComplaintStatus | null
  toStatus?: ComplaintStatus | null
  internal?: boolean
}) {
  await db.insert(complaintEvent).values({
    id: randomUUID(),
    complaintId: values.complaintId,
    type: values.type,
    message: values.message,
    actorId: values.actorId ?? null,
    note: values.note ?? null,
    fromStatus: values.fromStatus ?? null,
    toStatus: values.toStatus ?? null,
    internal: values.internal ?? false,
  })
}

/**
 * Notify one user about one complaint.
 *
 * The in-app notification is the record and is always written. WhatsApp is an
 * additional delivery channel on top of it, opted into per user, and is
 * deliberately not allowed to affect whether the notification itself is saved.
 */
export async function notify(values: {
  userId: string
  complaintId: string
  title: string
  body: string
}) {
  await db.insert(notification).values({
    id: randomUUID(),
    userId: values.userId,
    complaintId: values.complaintId,
    title: values.title,
    body: values.body,
  })

  await pushToWhatsApp(values)
}

/**
 * Mirror a notification to WhatsApp, when the user has asked for that.
 *
 * Every citizen-facing update already funnels through `notify`, so hooking in
 * here means a new kind of event is messaged without anyone remembering to
 * wire it up - and equally, nothing internal to staff can leak out, because
 * internal remarks never call `notify` in the first place.
 *
 * Awaited rather than fired and forgotten: on serverless the request can be
 * frozen the moment it returns, which kills an unawaited fetch mid-flight.
 * `sendWhatsApp` never throws and carries its own timeout, so this cannot
 * fail or stall the mutation that triggered it.
 */
async function pushToWhatsApp(values: {
  userId: string
  title: string
  body: string
}) {
  if (!isWhatsAppConfigured()) return

  const [recipient] = await db
    .select({
      phone: user.phone,
      enabled: user.whatsappNotifications,
    })
    .from(user)
    .where(eq(user.id, values.userId))
    .limit(1)

  if (!recipient?.enabled || !recipient.phone) return

  await sendWhatsApp({
    to: recipient.phone,
    // Asterisks are WhatsApp's bold markup, so the title reads as a heading.
    body: [`*${values.title}*`, values.body].join("\n\n"),
  })
}

export type NotificationView = {
  id: string
  title: string
  body: string
  complaintId: string | null
  read: boolean
  createdAt: Date
}

export async function listNotifications(
  userId: string,
  limit = 50,
): Promise<NotificationView[]> {
  const rows = await db
    .select()
    .from(notification)
    .where(eq(notification.userId, userId))
    .orderBy(desc(notification.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    complaintId: row.complaintId,
    read: row.readAt !== null,
    createdAt: row.createdAt,
  }))
}

export async function unreadCount(userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)))

  return row?.count ?? 0
}

/** Mark every unread notification for one user as read. */
export async function markAllRead(userId: string) {
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)))
}

export async function markRead(id: string, userId: string) {
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.id, id), eq(notification.userId, userId)))
}

export type TimelineEntry = {
  id: string
  type: string
  message: string
  note: string | null
  actorName: string | null
  internal: boolean
  createdAt: Date
}

/**
 * A complaint's timeline.
 *
 * `includeInternal` is false for citizens, so department-only remarks stay out
 * of the tracking view they see.
 */
export async function loadTimeline(
  complaintId: string,
  includeInternal: boolean,
): Promise<TimelineEntry[]> {
  const rows = await db
    .select({
      id: complaintEvent.id,
      type: complaintEvent.type,
      message: complaintEvent.message,
      note: complaintEvent.note,
      internal: complaintEvent.internal,
      createdAt: complaintEvent.createdAt,
      actorName: user.name,
    })
    .from(complaintEvent)
    .leftJoin(user, eq(complaintEvent.actorId, user.id))
    .where(
      includeInternal
        ? eq(complaintEvent.complaintId, complaintId)
        : and(
            eq(complaintEvent.complaintId, complaintId),
            eq(complaintEvent.internal, false),
          ),
    )
    .orderBy(complaintEvent.createdAt)

  return rows
}
