/**
 * The embedding model and its width.
 *
 * Split into its own module because the database schema imports the dimension
 * to size its `vector` column, and the schema must not pull in `server-only`
 * AI code. Changing either value means re-embedding every complaint, so the
 * dimension is pinned rather than read from the environment.
 *
 * Keep this at 1536: pgvector HNSW indexes reject vectors above 2000
 * dimensions, so a 3072 embedding would fail at insert time and break the
 * existing duplicate-search index.
 */

export const EMBEDDING_MODEL = "text-embedding-3-small"

export const EMBEDDING_DIMENSIONS = 1536
