import "server-only"

import { randomUUID } from "node:crypto"
import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createGroq } from "@ai-sdk/groq"
import { and, cosineDistance, desc, eq, gt, isNotNull, lt, ne, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/lib/db"
import { aiDecision, complaint, department, priority } from "@/lib/db/schema"
import { embedComplaint } from "@/lib/grievance/embedding"
import { readSettings, type PlatformSettings } from "@/lib/grievance/settings"
import { notify, recordEvent } from "@/lib/grievance/events"

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })

const TRIAGE_MODEL_ID = "openai/gpt-oss-120b"

const triageModel = () => groq(TRIAGE_MODEL_ID)

/**
 * How far below the linking threshold the pre-submit warning still speaks up.
 *
 * The stored `duplicateOfId` link is an assertion and wants to be right; the
 * form warning is only a question put to the citizen, who can overrule it.
 */
const WARN_MARGIN = 0.04

/**
 * The one structured call that classifies and prioritises a complaint.
 *
 * Deliberately a single call rather than two: department and priority are
 * decided from the same evidence, and asking twice doubles both the latency a
 * citizen waits through and the cost, while letting the two answers disagree
 * about what the complaint even says.
 *
 * Ids come from a closed list built out of the database, so the model picks
 * from what exists rather than inventing a department name.
 */
function triageSchema(departmentIds: string[], priorityIds: string[]) {
  return z.object({
    departmentId: z
      .enum(departmentIds as [string, ...string[]])
      .describe("The id of the department best equipped to resolve this."),
    departmentConfidence: z
      .number()
      .min(0)
      .max(1)
      .describe("How certain the routing is, 0 to 1."),
    departmentReason: z
      .string()
      .describe("One or two sentences justifying the department, for the audit log."),
    priorityId: z
      .enum(priorityIds as [string, ...string[]])
      .describe("The id of the priority level this complaint warrants."),
    priorityConfidence: z.number().min(0).max(1),
    priorityReason: z
      .string()
      .describe("Why this severity - reference danger, scale and urgency."),
    summary: z
      .string()
      .describe("A one-line neutral restatement of the issue, for staff lists."),
  })
}

type TriageOutcome = z.infer<ReturnType<typeof triageSchema>>

/** The catalogue the model chooses from, read fresh so admin edits take effect. */
async function loadCatalogue() {
  const [departments, priorities] = await Promise.all([
    db
      .select({
        id: department.id,
        name: department.name,
        description: department.description,
      })
      .from(department)
      .where(eq(department.active, true)),
    db
      .select({
        id: priority.id,
        name: priority.name,
        description: priority.description,
        severity: priority.severity,
      })
      .from(priority)
      .where(eq(priority.active, true)),
  ])

  return { departments, priorities }
}

function triagePrompt(
  departments: { id: string; name: string; description: string }[],
  priorities: {
    id: string
    name: string
    description: string
    severity: number
  }[],
) {
  return `You are the triage officer for a municipal grievance platform.

Route each complaint to exactly one department and assign exactly one priority
level, choosing only from the lists below and answering with their ids.

DEPARTMENTS
${departments
  .map((entry) => `- id=${entry.id} | ${entry.name}: ${entry.description}`)
  .join("\n")}

PRIORITY LEVELS
${priorities
  .map(
    (entry) =>
      `- id=${entry.id} | ${entry.name} (severity ${entry.severity}/5): ${entry.description}`,
  )
  .join("\n")}

How to judge priority:
- Immediate danger to life, health or safety outranks everything else.
- Weigh how many people are affected and whether the problem is spreading.
- An inconvenience that has persisted for months is not thereby an emergency.

Confidence is your own honest estimate. Use a value below 0.5 when the
complaint is too vague to route reliably - a human will then triage it, which
is far better than a confident wrong answer.`
}

/**
 * Find the nearest earlier complaint by cosine similarity.
 *
 * Phase 2 of the strategy: the shortlist comes from pgvector rather than a
 * broad SQL scan, so "water leaking near the market" matches "burst pipe at
 * the bazaar" even with no shared keywords.
 *
 * Only open complaints are considered - a resolved one is not a live duplicate,
 * and folding a new report into it would bury the fact that it came back.
 *
 * `createdAt` is a hard filter, not a tiebreak: triage runs detached from the
 * submission request, so two near-identical complaints filed seconds apart are
 * embedded in whatever order their background passes happen to finish. Without
 * this bound the later pass can look backwards and mark the *original* as a
 * duplicate of the copy, which buries the complaint that actually came first.
 */
async function findDuplicate(
  complaintId: string,
  createdAt: Date,
  embedding: number[],
  settings: PlatformSettings,
) {
  // drizzle's cosineDistance is 1 - cosine similarity.
  const similarity = sql<number>`1 - (${cosineDistance(complaint.embedding, embedding)})`

  const [match] = await db
    .select({
      id: complaint.id,
      reference: complaint.reference,
      title: complaint.title,
      similarity,
    })
    .from(complaint)
    .where(
      and(
        ne(complaint.id, complaintId),
        // A duplicate restates something already on record.
        lt(complaint.createdAt, createdAt),
        isNotNull(complaint.embedding),
        // A duplicate of a duplicate should point at the original instead.
        sql`${complaint.duplicateOfId} is null`,
        sql`${complaint.status} not in ('resolved', 'rejected')`,
        gt(similarity, settings.duplicateThreshold),
      ),
    )
    .orderBy(desc(similarity))
    .limit(1)

  return match ?? null
}

/**
 * The open complaints a draft would duplicate, checked before it is filed.
 *
 * The submission-time counterpart to `findDuplicate`: same embedding, same
 * threshold, but there is no row yet, so it filters by nothing more than the
 * citizen's own draft text. Several matches rather than one, because a warning
 * a citizen has to act on should show them what they are about to restate.
 *
 * The threshold is relaxed by a margin: the stored link wants to be right,
 * while this only asks "worth a second look before you file". A near-miss
 * shown here costs a glance; a near-miss missed here costs a duplicate.
 *
 * Returns an empty list whenever it cannot answer - embedding unavailable,
 * detection switched off, or the query failing. A check that cannot run must
 * never stand between a citizen and a genuine complaint.
 */
export async function findSimilarComplaints(input: {
  title: string
  description: string
  limit?: number
}) {
  try {
    const settings = await readSettings()

    if (!settings.aiEnabled || !settings.duplicateDetection) return []

    const embedding = await embedComplaint(input.title, input.description)

    if (!embedding) return []

    const similarity = sql<number>`1 - (${cosineDistance(complaint.embedding, embedding)})`

    // Warn a little below the linking threshold - see the note above.
    const floor = Math.max(0, settings.duplicateThreshold - WARN_MARGIN)

    return await db
      .select({
        id: complaint.id,
        reference: complaint.reference,
        title: complaint.title,
        status: complaint.status,
        createdAt: complaint.createdAt,
        similarity,
      })
      .from(complaint)
      .where(
        and(
          isNotNull(complaint.embedding),
          // Point at the original, never at something already folded into it.
          sql`${complaint.duplicateOfId} is null`,
          sql`${complaint.status} not in ('resolved', 'rejected')`,
          gt(similarity, floor),
        ),
      )
      .orderBy(desc(similarity))
      .limit(input.limit ?? 3)
  } catch (cause) {
    console.error("Could not check for similar complaints:", cause)
    return []
  }
}

/**
 * Run the full pipeline for one complaint: embed, classify, prioritise, dedupe.
 *
 * Called after the submission response has already been sent, so it must never
 * throw into a dead request - every failure leaves the complaint in
 * "submitted" for manual triage, which is a working state rather than an error.
 */
export async function triageComplaint(complaintId: string) {
  try {
    const settings = await readSettings()

    const [row] = await db
      .select({
        id: complaint.id,
        reference: complaint.reference,
        citizenId: complaint.citizenId,
        title: complaint.title,
        description: complaint.description,
        locationText: complaint.locationText,
        status: complaint.status,
        createdAt: complaint.createdAt,
      })
      .from(complaint)
      .where(eq(complaint.id, complaintId))
      .limit(1)

    if (!row) return

    if (!settings.aiEnabled) return

    // Embedding first: duplicate detection needs it, and storing it even when
    // classification fails means a later complaint can still match this one.
    const embedding = await embedComplaint(row.title, row.description)

    if (embedding) {
      await db
        .update(complaint)
        .set({ embedding })
        .where(eq(complaint.id, complaintId))
    }

    const { departments, priorities } = await loadCatalogue()

    // Nothing to choose from - an admin has not set the platform up yet.
    if (departments.length === 0 || priorities.length === 0) return

    let outcome: TriageOutcome | null = null

    if (settings.autoClassify || settings.autoPrioritize) {
      try {
        const { object } = await generateObject({
          model: triageModel(),
          schema: triageSchema(
            departments.map((entry) => entry.id),
            priorities.map((entry) => entry.id),
          ),
          system: triagePrompt(departments, priorities),
          prompt: [
            `Title: ${row.title}`,
            `Description: ${row.description}`,
            row.locationText ? `Location: ${row.locationText}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        })

        outcome = object
      } catch (cause) {
        console.error(`Triage model call failed for ${complaintId}:`, cause)
      }
    }

    const updates: Partial<typeof complaint.$inferInsert> = {}
    const decisions: (typeof aiDecision.$inferInsert)[] = []

    if (outcome) {
      const chosenDepartment = departments.find(
        (entry) => entry.id === outcome.departmentId,
      )
      const chosenPriority = priorities.find(
        (entry) => entry.id === outcome.priorityId,
      )

      // A decision row is written whether or not it is applied, so the log
      // shows the low-confidence calls a human then had to make.
      decisions.push({
        id: randomUUID(),
        complaintId,
        kind: "classification",
        outcomeId: outcome.departmentId,
        outcomeLabel: chosenDepartment?.name ?? null,
        confidence: outcome.departmentConfidence,
        reason: outcome.departmentReason,
        model: TRIAGE_MODEL_ID,
        metadata: { summary: outcome.summary },
      })

      decisions.push({
        id: randomUUID(),
        complaintId,
        kind: "prioritization",
        outcomeId: outcome.priorityId,
        outcomeLabel: chosenPriority?.name ?? null,
        confidence: outcome.priorityConfidence,
        reason: outcome.priorityReason,
        model: TRIAGE_MODEL_ID,
      })

      // Only act on a call the model was actually confident about. Below the
      // threshold the complaint stays unrouted and shows up in manual triage.
      if (
        settings.autoClassify &&
        outcome.departmentConfidence >= settings.confidenceThreshold
      ) {
        updates.departmentId = outcome.departmentId
        updates.departmentSource = "ai"
      }

      if (
        settings.autoPrioritize &&
        outcome.priorityConfidence >= settings.confidenceThreshold
      ) {
        updates.priorityId = outcome.priorityId
        updates.prioritySource = "ai"
      }
    }

    let duplicateOf: Awaited<ReturnType<typeof findDuplicate>> | null = null

    if (settings.duplicateDetection && embedding) {
      duplicateOf = await findDuplicate(
        complaintId,
        row.createdAt,
        embedding,
        settings,
      )

      if (duplicateOf) {
        updates.duplicateOfId = duplicateOf.id

        decisions.push({
          id: randomUUID(),
          complaintId,
          kind: "duplicate",
          outcomeId: duplicateOf.id,
          outcomeLabel: duplicateOf.reference,
          confidence: duplicateOf.similarity,
          reason: `Semantically near-identical to ${duplicateOf.reference} ("${duplicateOf.title}") at ${(duplicateOf.similarity * 100).toFixed(1)}% similarity, above the ${(settings.duplicateThreshold * 100).toFixed(0)}% threshold.`,
          model: "pgvector/cosine",
          metadata: { similarity: duplicateOf.similarity },
        })
      }
    }

    // Triage never claims a complaint on anyone's behalf: routing it makes it
    // "triaged", and only a department user accepting it makes it "assigned".
    // Without that split, "assigned" would mean nothing more than "the model
    // picked a department", and no queue would show what is genuinely unowned.
    if (
      row.status === "submitted" &&
      (updates.departmentId || updates.priorityId || duplicateOf)
    ) {
      updates.status = "triaged"
    }

    if (Object.keys(updates).length > 0) {
      await db.update(complaint).set(updates).where(eq(complaint.id, complaintId))
    }

    if (decisions.length > 0) {
      await db.insert(aiDecision).values(decisions)
    }

    // One timeline entry summarising the pass, so the citizen sees that
    // something happened rather than a silent status jump.
    const parts: string[] = []

    if (updates.departmentId) {
      const name = departments.find(
        (entry) => entry.id === updates.departmentId,
      )?.name
      if (name) parts.push(`routed to ${name}`)
    }

    if (updates.priorityId) {
      const name = priorities.find(
        (entry) => entry.id === updates.priorityId,
      )?.name
      if (name) parts.push(`prioritised as ${name}`)
    }

    if (duplicateOf) parts.push(`linked to ${duplicateOf.reference}`)

    await recordEvent({
      complaintId,
      type: "ai_triage",
      message:
        parts.length > 0
          ? `AI triage: ${parts.join(", ")}.`
          : "AI triage could not route this complaint confidently; it is awaiting manual review.",
      toStatus: updates.status ?? null,
    })

    // Only tell the citizen when triage actually decided something. "We looked
    // at it and could not route it" is noise to them and a queue item for
    // staff, so a low-confidence pass stays silent.
    if (parts.length > 0) {
      await notify({
        userId: row.citizenId,
        complaintId,
        title: `${row.reference} has been triaged`,
        body: `Your complaint was ${parts.join(", ")}.`,
      })
    }
  } catch (cause) {
    // The complaint is already saved; triage failing must not lose it.
    console.error(`Triage failed for complaint ${complaintId}:`, cause)
  }
}
