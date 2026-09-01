import "server-only"

import { embed } from "ai"
import { createOpenAI } from "@ai-sdk/openai"

import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/lib/grievance/embedding-config"

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

/**
 * The text a complaint is embedded from.
 *
 * Title and description together: the title alone is too short to separate
 * "Streetlight out" on two different roads, and the description alone loses
 * the one line a citizen actually thought about.
 */
export function embeddingInput(title: string, description: string) {
  return `${title}\n\n${description}`.slice(0, 8000)
}

/**
 * Embed one complaint, or return null if embedding is unavailable.
 *
 * Never throws. A missing embedding degrades duplicate detection to "no
 * duplicates found", which is the right failure: a complaint that cannot be
 * compared must still be accepted and worked.
 */
export async function embedComplaint(
  title: string,
  description: string,
): Promise<number[] | null> {
  if (!process.env.OPENAI_API_KEY) return null

  try {
    const { embedding } = await embed({
      model: openai.textEmbeddingModel(EMBEDDING_MODEL),
      value: embeddingInput(title, description),
    })

    // The column is fixed-width; a model swap that changes the width would
    // otherwise fail deep inside the driver with an opaque error.
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      console.error(
        `Embedding width ${embedding.length} does not match the ${EMBEDDING_DIMENSIONS}-wide column.`,
      )
      return null
    }

    return embedding
  } catch (cause) {
    console.error("Could not embed complaint:", cause)
    return null
  }
}
