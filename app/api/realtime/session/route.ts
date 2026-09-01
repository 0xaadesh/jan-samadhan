import { headers } from "next/headers"
import { eq } from "drizzle-orm"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { toRole } from "@/lib/roles"
import {
  REALTIME_TOOLS,
  realtimeInstructions,
} from "@/lib/grievance/realtime-tools"

/** The realtime model. Distinct from OPENAI_MODEL, which is a text model. */
const MODEL_ID = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1"

const VOICE = process.env.OPENAI_REALTIME_VOICE ?? "marin"

/**
 * Mint a short-lived client secret for the voice assistant.
 *
 * The browser needs a credential to open its own WebRTC connection to OpenAI,
 * and it must never be the platform API key - that key would be readable by
 * anyone who opens devtools and is not scoped or expiring. An ephemeral secret
 * is minted per session, after the same authorisation the written chat applies.
 *
 * The instructions and the tool list are pinned here rather than sent up from
 * the browser. A session configured client-side is a session a citizen can
 * reconfigure: the prompt, the tool names and their argument shapes would all
 * be editable, and the tools are what reach real data.
 */
export async function POST() {
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
    })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1)

  if (!row || !row.active) {
    return new Response("Unauthorized", { status: 401 })
  }

  // Same scope as the written assistant: its tools mean "your own
  // complaints", which is not a meaningful scope for a department queue.
  if (toRole(row.role) !== "citizen") {
    return new Response("The assistant is available to citizens only.", {
      status: 403,
    })
  }

  if (!process.env.OPENAI_API_KEY) {
    return new Response("The voice assistant is not configured.", {
      status: 503,
    })
  }

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: MODEL_ID,
        instructions: realtimeInstructions(row.name),
        audio: {
          // Turn detection and input transcription are set by the browser on
          // the open data channel instead - they are latency tuning, and
          // keeping them in one place avoids two configs that disagree.
          output: { voice: VOICE },
        },
        tools: REALTIME_TOOLS,
        tool_choice: "auto",
      },
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    console.error("Realtime client secret failed:", detail)

    return new Response("Could not start a voice session.", { status: 502 })
  }

  const payload = (await response.json()) as { value?: string }

  if (!payload.value) {
    return new Response("Could not start a voice session.", { status: 502 })
  }

  // Only the secret goes back. The model id is not the browser's to choose.
  return Response.json({ clientSecret: payload.value, model: MODEL_ID })
}
