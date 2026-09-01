/**
 * Create the demo accounts: one admin, one user per department, two citizens.
 *
 *   bun run scripts/seed-users.ts
 *
 * Accounts are created through Better Auth's own sign-up endpoint rather than
 * by inserting rows, so passwords are hashed with exactly the same scheme the
 * login path verifies against - a hand-rolled hash would produce accounts that
 * exist but cannot sign in.
 *
 * Email verification is then set directly, because `requireEmailVerification`
 * is on and there is no mail provider wired up locally. That is the whole point
 * of this script: it skips the Resend round trip for demo and development.
 *
 * Idempotent - an account that already exists is left alone apart from having
 * its role, department and verified flag re-applied.
 */

import { eq } from "drizzle-orm"

import { auth } from "../lib/auth"
import { db } from "../lib/db"
import { department, user } from "../lib/db/schema"
import type { Role } from "../lib/roles"

/** One password for every demo account - these are not real credentials. */
const PASSWORD = "Password123!"

/** The account you already registered, promoted rather than created. */
const ADMIN_EMAIL = "aadesh.gavhane100@gmail.com"

type Seed = {
  name: string
  email: string
  role: Role
  /** Department slug, for department users. */
  departmentSlug?: string
}

const PEOPLE: Seed[] = [
  // One officer per seeded department, so every queue has an owner.
  {
    name: "Priya Deshmukh",
    email: "water.officer@jansamadhan.test",
    role: "department",
    departmentSlug: "water-supply",
  },
  {
    name: "Rahul Kulkarni",
    email: "roads.officer@jansamadhan.test",
    role: "department",
    departmentSlug: "roads-infrastructure",
  },
  {
    name: "Sneha Patil",
    email: "sanitation.officer@jansamadhan.test",
    role: "department",
    departmentSlug: "sanitation-waste",
  },
  {
    name: "Vikram Joshi",
    email: "electricity.officer@jansamadhan.test",
    role: "department",
    departmentSlug: "electricity-street-lighting",
  },
  {
    name: "Anjali Rao",
    email: "health.officer@jansamadhan.test",
    role: "department",
    departmentSlug: "public-health",
  },
  {
    name: "Manish Shinde",
    email: "parks.officer@jansamadhan.test",
    role: "department",
    departmentSlug: "parks-public-spaces",
  },
  {
    name: "Kavita Nair",
    email: "traffic.officer@jansamadhan.test",
    role: "department",
    departmentSlug: "traffic-transport",
  },
  {
    name: "Arjun Mehta",
    email: "fire.officer@jansamadhan.test",
    role: "department",
    departmentSlug: "fire-emergency-services",
  },

  // Two ordinary citizens, to exercise the citizen-facing half of the app.
  {
    name: "Ramesh Iyer",
    email: "ramesh.citizen@jansamadhan.test",
    role: "citizen",
  },
  {
    name: "Fatima Sheikh",
    email: "fatima.citizen@jansamadhan.test",
    role: "citizen",
  },
]

/** Slug to id, so the seeds can name departments readably. */
const departments = await db
  .select({ id: department.id, slug: department.slug, name: department.name })
  .from(department)

const bySlug = new Map(departments.map((entry) => [entry.slug, entry]))

if (departments.length === 0) {
  console.error(
    "No departments found. Run `bun run db:seed` first, then re-run this.",
  )
  process.exit(1)
}

async function findByEmail(email: string) {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  return row ?? null
}

/**
 * Create the account if it is missing, then force its role, department and
 * verified flag. Splitting it this way is what makes a re-run safe.
 */
async function ensure(seed: Seed) {
  const existing = await findByEmail(seed.email)

  if (!existing) {
    try {
      await auth.api.signUpEmail({
        body: {
          name: seed.name,
          email: seed.email,
          password: PASSWORD,
        },
      })
    } catch (cause) {
      console.error(
        `  could not create ${seed.email}:`,
        cause instanceof Error ? cause.message : cause,
      )
      return null
    }
  }

  const row = await findByEmail(seed.email)

  if (!row) {
    console.error(`  ${seed.email} was not created`)
    return null
  }

  const departmentId = seed.departmentSlug
    ? (bySlug.get(seed.departmentSlug)?.id ?? null)
    : null

  if (seed.departmentSlug && !departmentId) {
    console.error(
      `  no department with slug "${seed.departmentSlug}" - assigning none`,
    )
  }

  await db
    .update(user)
    .set({
      role: seed.role,
      // Only department users carry a department; admins see all of them.
      departmentId: seed.role === "department" ? departmentId : null,
      emailVerified: true,
      active: true,
    })
    .where(eq(user.id, row.id))

  const where = seed.departmentSlug
    ? ` -> ${bySlug.get(seed.departmentSlug)?.name ?? "?"}`
    : ""

  console.info(
    `  ${existing ? "updated" : "created"}  ${seed.role.padEnd(10)} ${seed.email}${where}`,
  )

  return row.id
}

console.info("Seeding demo accounts...\n")

// The admin is promoted, not created - it is a real account you registered.
const admin = await findByEmail(ADMIN_EMAIL)

if (admin) {
  await db
    .update(user)
    .set({
      role: "admin",
      departmentId: null,
      emailVerified: true,
      active: true,
    })
    .where(eq(user.id, admin.id))

  console.info(`  promoted  admin      ${ADMIN_EMAIL}`)
} else {
  console.error(
    `  ${ADMIN_EMAIL} has not signed up yet - skipping the admin promotion.`,
  )
}

for (const seed of PEOPLE) {
  await ensure(seed)
}

console.info(
  `\nDone. Every seeded account uses the password: ${PASSWORD}\nSee CREDENTIALS.md for the full list.`,
)

process.exit(0)
