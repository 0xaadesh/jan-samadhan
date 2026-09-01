/**
 * Create the `vector` extension.
 *
 * Must run before `drizzle-kit push`, because the complaint table declares a
 * `vector(1536)` column and an HNSW index - neither type-checks in Postgres
 * until the extension exists. The image ships the extension; this only enables
 * it in this database.
 */

import { sql } from "drizzle-orm"

import { db } from "../lib/db"

await db.execute(sql`create extension if not exists vector`)

console.info("pgvector is enabled.")

process.exit(0)
