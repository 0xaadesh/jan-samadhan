import { eq } from "drizzle-orm"

import { db } from "../lib/db"
import { complaint } from "../lib/db/schema"
import { embedComplaint } from "../lib/grievance/embedding"

const rows = await db
  .select({
    id: complaint.id,
    title: complaint.title,
    description: complaint.description,
  })
  .from(complaint)

let updated = 0
let skipped = 0

for (const row of rows) {
  const embedding = await embedComplaint(row.title, row.description)

  if (!embedding) {
    skipped += 1
    continue
  }

  await db
    .update(complaint)
    .set({ embedding })
    .where(eq(complaint.id, row.id))

  updated += 1
}

console.log(
  `Updated ${updated} complaint embeddings; skipped ${skipped} due to embedding failure.`,
)
process.exit(0)
