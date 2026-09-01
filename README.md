# Jan Samadhan — SIH26 Grievance Platform

A civic grievance redressal platform. Citizens file complaints in plain language;
an AI pipeline classifies, prioritises and de-duplicates them; department staff
work the queue; administrators run the platform and can override every automated
decision.

## Roles

| Role | Sees | Can do |
| --- | --- | --- |
| **Citizen** | Only their own complaints | File complaints with photos and location, track status, read updates |
| **Department** | Their department's queue | Accept, change status, add public/internal remarks, override routing |
| **Admin** | Everything | Manage users, departments, priority levels, AI configuration and analytics |

Everyone signs up as a citizen. Roles are assigned afterwards — there is no way
to self-promote, and the signup payload cannot set a role.

## Getting started

```bash
docker compose up -d      # Postgres (pgvector) + MinIO, bucket created for you
bun install
bun run db:setup          # enable pgvector, push the schema, seed the catalogue
bun run dev
```

Then sign up in the browser, and promote yourself:

```bash
bun run scripts/make-admin.ts you@example.com
```

`make-admin` refuses to create accounts — the user must have signed up first.

### Environment

`.env` covers everything. The values that matter:

- `DATABASE_URL` — Postgres, must be a pgvector-capable server
- `OPENAI_API_KEY`, `OPENAI_MODEL` — the triage classifier
- `S3_*` — MinIO locally; point at R2 or S3 in production with no code change
- `BETTER_AUTH_SECRET`, `RESEND_API_KEY` — sessions and transactional email

Without an OpenAI key the platform still works: complaints are accepted and sit
in the manual triage queue instead of being routed automatically.

## The AI pipeline

Every complaint runs `Submit → Normalize → Classify → Prioritize → Detect
duplicate → Assign → Track → Resolve`. Triage happens *after* the submission
response is sent, so a citizen gets their reference number immediately.

**Classification and prioritisation** are one `generateObject` call
([lib/grievance/triage.ts](lib/grievance/triage.ts)). Both decisions come from
the same evidence, so asking twice would double latency and cost while letting
the two answers disagree about what the complaint says. The model chooses from a
closed list of department and priority **ids** read live from the database, so it
cannot invent a department, and an admin retunes routing by editing a
department's description rather than by touching a prompt.

**Duplicate detection** is already at Phase 2: complaints are embedded with
`text-embedding-3-small` and compared by pgvector cosine distance, so "water
leaking near the market" matches "burst pipe at the bazaar" with no shared
keywords. Only open complaints are candidates — a resolved one is not a live
duplicate, and folding a new report into it would hide that the problem came
back.

Every decision writes an `ai_decision` row with a **confidence score and
reason**, whether or not it was applied. Below the configurable confidence
threshold the complaint is left for manual triage — a wrong confident routing
costs more than an unrouted complaint. Overrides flag the decision rather than
deleting it, so the AI log remains the record for auditing a bad call.

### Progressive strategy

- **Phase 1** (LLM + lookup) — done, and superseded for duplicates.
- **Phase 2** (embeddings + semantic similarity) — **done**; pgvector with an
  HNSW cosine index.
- **Phase 3** (clustering, recurring issues) — partially present: duplicate
  links already rank recurring issues in analytics.
- **Phase 4** (GIS hotspots) — approximated in
  [lib/grievance/geo.ts](lib/grievance/geo.ts) by rounding coordinates onto a
  ~1.1km grid. Enough to answer "where do complaints cluster" with no PostGIS
  dependency; swapping in real GIS is a change to that one file.

## Architecture

- **Next.js 16 / React 19**, App Router, server actions throughout
- **Postgres + pgvector** via Drizzle; `lib/db/schema.ts` is the single source
- **better-auth** with email verification and password reset
- **MinIO / S3** for complaint photos — the browser uploads straight to storage
  with a presigned PUT, so a 10MB photo never passes through the Next server;
  keys are server-generated under the uploader's own prefix and verified with a
  HEAD before they are trusted
- **shadcn/ui + Tailwind v4**

### Authorisation

Scope is folded into the SQL rather than checked after loading
([lib/grievance/complaints.ts](lib/grievance/complaints.ts)), so a complaint
outside a viewer's scope is indistinguishable from one that does not exist, and
there is no path where a row is fetched and the check is forgotten. A department
user cannot widen their view by crafting a filter — the role condition is ANDed
on top of whatever they asked for.

Roles are read from the database on every request rather than carried in the
session, so revoking access takes effect on the next navigation.

## Scripts

| Command | Purpose |
| --- | --- |
| `bun run db:setup` | Enable pgvector, push the schema, seed departments and priorities |
| `bun run db:seed` | Seed only (idempotent — safe to re-run) |
| `bun run scripts/make-admin.ts <email>` | Promote an existing account to admin |
| `bun run db:studio` | Browse the database |
| `bun run build` | Production build |
