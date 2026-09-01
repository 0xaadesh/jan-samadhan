/**
 * Promote an existing account to admin.
 *
 *   bun run scripts/make-admin.ts someone@example.com
 *
 * Everyone signs up as a citizen, so this is the only way the first admin
 * comes into being. It deliberately refuses to create an account: the user
 * must have registered and verified their email first, which keeps this script
 * from becoming a way to mint credentials.
 */

import { eq } from "drizzle-orm"

import { db } from "../lib/db"
import { user } from "../lib/db/schema"

const email = process.argv[2]?.trim().toLowerCase()

if (!email) {
  console.error("Usage: bun run scripts/make-admin.ts <email>")
  process.exit(1)
}

const [existing] = await db
  .select({ id: user.id, name: user.name, role: user.role })
  .from(user)
  .where(eq(user.email, email))
  .limit(1)

if (!existing) {
  console.error(
    `No account found for ${email}. Have them sign up first, then run this again.`,
  )
  process.exit(1)
}

if (existing.role === "admin") {
  console.info(`${email} is already an admin.`)
  process.exit(0)
}

await db
  .update(user)
  // An admin sees every department, so any previous department assignment is
  // cleared rather than left to imply a scope that no longer applies.
  .set({ role: "admin", departmentId: null, active: true })
  .where(eq(user.id, existing.id))

console.info(`${existing.name} <${email}> is now an admin.`)
process.exit(0)
