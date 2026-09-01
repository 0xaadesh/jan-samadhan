import "server-only"

import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"

import { getObjectBytes } from "@/lib/grievance/storage"

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

/**
 * The vision pass runs on the same model the triage pass uses.
 *
 * `OPENAI_IMAGE_MODEL` is an image *generation* model and cannot look at a
 * photo, so it is deliberately not read here - a separate override is provided
 * for deployments that want a cheaper vision model than the triage one.
 */
const MODEL_ID =
  process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.4-mini"

const verdictSchema = z.object({
  matches: z
    .boolean()
    .describe(
      "True if this photo could plausibly be evidence for the reported problem.",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("How certain the verdict is, 0 to 1."),
  depicts: z
    .string()
    .describe("A short, literal description of what the photo actually shows."),
  reason: z
    .string()
    .describe(
      "One or two sentences a citizen will read, explaining the verdict in plain language.",
    ),
})

export type ImageVerdict = {
  /** Whether the photo may be attached. */
  ok: boolean
  /** Shown on the form when the photo is rejected. */
  message: string
}

const SYSTEM_PROMPT = `You check whether a photo attached to a municipal
grievance actually shows the problem the citizen described.

You are a relevance check, not a quality check. Accept the photo whenever it
could plausibly be evidence for the reported problem:

- Accept partial, dark, blurry, badly framed or distant shots. A citizen
  photographing a pothole at night is still photographing a pothole.
- Accept a photo showing the surroundings of the problem - a street, a
  building, a stretch of road - when the described problem would reasonably be
  found there, even if the defect itself is hard to make out.
- Accept a photo that shows only part of what was described. A complaint about
  garbage and a broken bin needs only one of them to be visible.

Reject the photo only when it clearly has nothing to do with the complaint:

- Screenshots, memes, selfies, documents, pets, food, stock photos or product
  shots unrelated to the described issue.
- A photo of an entirely different kind of problem - a burst pipe attached to
  a complaint about a streetlight.
- A blank, fully black or fully white frame that shows nothing at all.

When you are unsure, accept. A wrongly rejected photo blocks a real complaint
from being filed, which is far worse than a loosely related photo reaching a
department. Set confidence below 0.5 whenever you cannot tell.

In "reason", address the citizen directly and say what the photo appears to
show and why it does not match, so they know which file to replace.`

/**
 * Check one uploaded photo against the complaint text.
 *
 * Never throws: if the model, the key or the network fails, the photo is
 * accepted. A verification service being down must not stop a citizen from
 * reporting a burst main.
 */
export async function verifyComplaintImage({
  key,
  title,
  description,
}: {
  key: string
  title: string
  description: string
}): Promise<ImageVerdict> {
  if (!process.env.OPENAI_API_KEY) return { ok: true, message: "" }

  try {
    const object = await getObjectBytes(key)

    if (!object) return { ok: true, message: "" }

    const { object: verdict } = await generateObject({
      model: openai(MODEL_ID),
      schema: verdictSchema,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "REPORTED PROBLEM",
                `Title: ${title}`,
                `Description: ${description}`,
                "",
                "Does the attached photo plausibly show this problem?",
              ].join("\n"),
            },
            {
              type: "file",
              data: { type: "data", data: object.bytes },
              mediaType: object.contentType,
            },
          ],
        },
      ],
    })

    // Only a confident rejection blocks the submission. An unsure model saying
    // "no" is exactly the case the instructions tell it to accept, and acting
    // on it anyway would turn every ambiguous photo into a dead end.
    if (!verdict.matches && verdict.confidence >= 0.5) {
      return { ok: false, message: verdict.reason }
    }

    return { ok: true, message: "" }
  } catch (cause) {
    console.error(`Image verification failed for ${key}:`, cause)
    return { ok: true, message: "" }
  }
}
