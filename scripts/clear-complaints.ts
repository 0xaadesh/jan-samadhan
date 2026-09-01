/**
 * Delete every complaint and everything hanging off one.
 *
 *   bun run scripts/clear-complaints.ts
 *
 * Images, timeline events, AI decisions and complaint notifications all
 * cascade from the complaint row, so a single delete clears the lot.
 * Departments, priorities, users and settings are left untouched.
 */

import { sql } from "drizzle-orm"

import { db } from "../lib/db"
import { complaint } from "../lib/db/schema"

const [{ count }] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(complaint)

await db.delete(complaint)

console.log(`Deleted ${count} complaint(s) and all their attached records.`)

process.exit(0)
