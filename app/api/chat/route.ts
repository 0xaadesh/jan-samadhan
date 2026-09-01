import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  tool,
  toUIMessageStream,
  type UIMessage,
} from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { department, user } from "@/lib/db/schema"
import { toRole } from "@/lib/roles"
import { clientTools } from "@/lib/grievance/chat-tools"
import { listComplaints, loadComplaint } from "@/lib/grievance/complaints"
import { loadTimeline } from "@/lib/grievance/events"
import { STATUS_INFO } from "@/lib/grievance/status"

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MODEL_ID = process.env.OPENAI_MODEL ?? "gpt-5.4-mini"

/** A conversation can involve several tool round trips. */
export const maxDuration = 60

/**
 * The assistant that files and tracks complaints in conversation.
 *
 * Citizens only. Staff have queues, filters and an audit trail built for the
 * job; a chat window that could act on someone else's complaint would be a
 * second, weaker authorisation surface over the same data.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    return new Response("Unauthorized", { status: 401 })
  }

  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      role: user.role,
      active: user.active,
      departmentId: user.departmentId,
    })
    .from(user)
    .leftJoin(department, eq(user.departmentId, department.id))
    .where(eq(user.id, session.user.id))
    .limit(1)

  if (!row || !row.active) {
    return new Response("Unauthorized", { status: 401 })
  }

  const viewer = {
    id: row.id,
    role: toRole(row.role),
    departmentId: row.departmentId,
  }

  if (viewer.role !== "citizen") {
    return new Response("The assistant is available to citizens only.", {
      status: 403,
    })
  }

  const { messages }: { messages: UIMessage[] } = await request.json()

  const result = streamText({
    model: openai(MODEL_ID),
    messages: await convertToModelMessages(messages),
    system: systemPrompt(row.name),
    tools: {
      // Fulfilled in the browser - see lib/grievance/chat-tools.ts.
      ...clientTools,

      /** Read-only, server-side: scoped to this citizen's own complaints. */
      listMyComplaints: tool({
        description:
          "List the complaints this citizen has filed, most recent first. Use this for questions like 'what have I reported' or 'any updates'.",
        inputSchema: z.object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(20)
            .describe("How many to return. Use 5 unless asked for more."),
        }),
        execute: async ({ limit }) => {
          const rows = await listComplaints(viewer, { limit })

          return rows.map((entry) => ({
            reference: entry.reference,
            title: entry.title,
            status: STATUS_INFO[entry.status].label,
            department: entry.departmentName,
            priority: entry.priorityName,
            filedOn: entry.createdAt.toISOString().slice(0, 10),
          }))
        },
      }),

      /**
       * The progress of one complaint, by reference.
       *
       * `loadComplaint` applies the citizen scope itself, so a reference
       * belonging to someone else simply is not found - the tool cannot be
       * talked into reading another person's complaint.
       */
      getComplaintStatus: tool({
        description:
          "Get the full status and timeline of one complaint by its reference, for example GRV-4F2A19.",
        inputSchema: z.object({
          reference: z
            .string()
            .describe("The complaint reference, like GRV-4F2A19."),
        }),
        execute: async ({ reference }) => {
          const matches = await listComplaints(viewer, {
            search: reference.trim(),
            limit: 5,
          })

          const match = matches.find(
            (entry) =>
              entry.reference.toLowerCase() === reference.trim().toLowerCase(),
          )

          const detail = match ? await loadComplaint(match.id, viewer) : null

          if (!detail) {
            return {
              found: false as const,
              message: `No complaint of yours has the reference ${reference}.`,
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
        },
      }),
    },
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  })
}

function systemPrompt(citizenName: string) {
  return `You are the assistant for a municipal grievance platform, helping
${citizenName} report civic problems and follow the ones they have already
reported. You are speaking to a citizen, never to staff.

WHAT YOU CAN DO
- File a new complaint: potholes, water supply, garbage, streetlights, drains,
  stray animals, encroachment and the like.
- Report on complaints they have already filed, including status and progress.

FILING A COMPLAINT
1. If they have not said what the problem is, ask - one short question.
2. As soon as you roughly understand the problem, call collectComplaintDetails.
   Draft a title and description from their own words and pass them as the
   suggestions; they will correct them in the form rather than dictate them to
   you. Do not ask for title, description, location and photo one at a time in
   chat - the form collects them together.
3. When the form comes back confirmed, call fileComplaint with those details.
4. Tell them the reference number and that it is being routed automatically.

TRACKING
Use listMyComplaints for "what have I reported" and getComplaintStatus for a
specific reference. Report what the timeline actually says. Never guess at a
status, a department or a completion date.

HOW TO WRITE
Plain language, no jargon, no markdown headings. Two or three sentences at a
time. This is a public service used by people in a hurry and often on a phone,
some of them reporting something genuinely urgent.

If a problem involves immediate danger to life - live wires, gas, collapse,
sewage in a home - say plainly that they should call emergency services as well
as filing this complaint.

Never promise a repair, a timeline or an outcome. You record and report; the
departments decide. Stay on civic complaints: if asked for something else, say
that is not what you are for and offer to help file or track a complaint.`
}
