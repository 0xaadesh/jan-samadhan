/**
 * Seed the departments and priority levels a fresh platform needs.
 *
 *   bun run scripts/seed.ts
 *
 * Idempotent: it skips anything already present, so it is safe to re-run after
 * adding a department to the list below. It creates no users - accounts come
 * from signup, and admins from scripts/make-admin.ts.
 */

import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"

import { db } from "../lib/db"
import { department, priority } from "../lib/db/schema"
import { slugify } from "../lib/grievance/limits"

/**
 * Descriptions are written for the classifier, not for a brochure: they name
 * the concrete things citizens actually report, because that text is what the
 * model matches a complaint against.
 */
const DEPARTMENTS = [
  {
    name: "Water Supply",
    description:
      "Piped water supply and sewerage. Handles no water, low pressure, contaminated or foul-smelling water, burst mains, leaking pipelines, overflowing sewers, blocked drains and water billing disputes.",
  },
  {
    name: "Roads & Infrastructure",
    description:
      "Public roads, footpaths and bridges. Handles potholes, broken or sunken road surfaces, damaged footpaths, missing manhole covers, road cave-ins, construction debris and blocked or encroached pavements.",
  },
  {
    name: "Sanitation & Waste",
    description:
      "Solid waste and public cleanliness. Handles uncollected garbage, overflowing bins, illegal dumping, dead animals, public toilet cleanliness, drain silt removal and pest or mosquito breeding sites.",
  },
  {
    name: "Electricity & Street Lighting",
    description:
      "Public electrical supply and lighting. Handles street lights out or flickering, exposed or hanging live wires, sparking transformers, damaged poles and unscheduled power outages in public areas.",
  },
  {
    name: "Public Health",
    description:
      "Community health and food safety. Handles disease outbreaks, stagnant water and vector breeding, unhygienic food establishments, medical waste dumping and stray animal menace.",
  },
  {
    name: "Parks & Public Spaces",
    description:
      "Parks, gardens, playgrounds and public grounds. Handles damaged play equipment, fallen or dangerous trees, unmaintained lawns, broken benches, encroachment and vandalism of public property.",
  },
  {
    name: "Fire & Emergency Services",
    description:
      "Fire and rescue, and immediate life-safety emergencies. Handles active fires in homes, shops and vehicles, gas leaks and cylinder leaks, building collapse and people trapped, electrical fires, and rescue from flooding, drowning or confined spaces.",
  },
  {
    name: "Traffic & Transport",
    description:
      "Traffic management and public transport. Handles broken signals, missing or damaged signage, illegal parking, unsafe crossings, bus stop conditions and traffic congestion black spots.",
  },
]

/**
 * Five levels mapped onto the 1-5 severity scale, with SLA targets that
 * actually differ - a scale where everything is due in a week is not a scale.
 */
const PRIORITIES = [
  {
    name: "Critical",
    severity: 5,
    slaHours: 4,
    color: "#DC2626",
    description:
      "Immediate danger to life or health, or a failure affecting an entire locality. Live wires, sewage in homes, road cave-ins, contaminated drinking water.",
  },
  {
    name: "High",
    severity: 4,
    slaHours: 24,
    color: "#EA580C",
    description:
      "Serious disruption or a safety hazard that will worsen quickly. Burst mains, large potholes on busy roads, uncollected waste near schools or hospitals.",
  },
  {
    name: "Medium",
    severity: 3,
    slaHours: 72,
    color: "#CA8A04",
    description:
      "Genuine disruption to daily life without immediate danger. Intermittent supply, single street light out, minor road damage.",
  },
  {
    name: "Low",
    severity: 2,
    slaHours: 168,
    color: "#0891B2",
    description:
      "Inconvenience or gradual deterioration. Faded road markings, an unmaintained park lawn, a broken bench.",
  },
  {
    name: "Routine",
    severity: 1,
    slaHours: 336,
    color: "#64748B",
    description:
      "Cosmetic issues, suggestions and general requests with no service impact.",
  },
]

let created = 0

for (const entry of DEPARTMENTS) {
  const slug = slugify(entry.name)

  const [existing] = await db
    .select({ id: department.id })
    .from(department)
    .where(eq(department.slug, slug))
    .limit(1)

  if (existing) continue

  await db.insert(department).values({
    id: randomUUID(),
    name: entry.name,
    slug,
    description: entry.description,
  })

  created++
  console.info(`department: ${entry.name}`)
}

for (const entry of PRIORITIES) {
  const [existing] = await db
    .select({ id: priority.id })
    .from(priority)
    .where(eq(priority.name, entry.name))
    .limit(1)

  if (existing) continue

  await db.insert(priority).values({ id: randomUUID(), ...entry })

  created++
  console.info(`priority: ${entry.name} (severity ${entry.severity})`)
}

console.info(
  created > 0
    ? `\nSeeded ${created} row(s). Sign up, then: bun run scripts/make-admin.ts <your-email>`
    : "\nNothing to do - departments and priorities are already seeded.",
)

process.exit(0)
