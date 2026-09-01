import "server-only"

import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { platformSetting } from "@/lib/db/schema"

/** The single settings row's primary key. */
const SINGLETON = "singleton"

export type PlatformSettings = {
  aiEnabled: boolean
  autoClassify: boolean
  autoPrioritize: boolean
  duplicateDetection: boolean
  duplicateThreshold: number
  confidenceThreshold: number
  autoAssign: boolean
  platformName: string
}

/**
 * The defaults, used before an admin has ever opened the settings screen.
 *
 * Kept in code as well as in column defaults so `readSettings` can answer
 * without writing to the database on a read path.
 */
export const DEFAULT_SETTINGS: PlatformSettings = {
  aiEnabled: true,
  autoClassify: true,
  autoPrioritize: true,
  duplicateDetection: true,
  duplicateThreshold: 0.74,
  confidenceThreshold: 0.55,
  autoAssign: true,
  platformName: "Jan Samadhan",
}

/** Read the platform settings, falling back to defaults when unset. */
export async function readSettings(): Promise<PlatformSettings> {
  const [row] = await db
    .select()
    .from(platformSetting)
    .where(eq(platformSetting.id, SINGLETON))
    .limit(1)

  if (!row) return DEFAULT_SETTINGS

  return {
    aiEnabled: row.aiEnabled,
    autoClassify: row.autoClassify,
    autoPrioritize: row.autoPrioritize,
    duplicateDetection: row.duplicateDetection,
    duplicateThreshold: row.duplicateThreshold,
    confidenceThreshold: row.confidenceThreshold,
    autoAssign: row.autoAssign,
    platformName: row.platformName,
  }
}

/**
 * Write the settings, creating the row on first save.
 *
 * An upsert rather than an update: the row does not exist until an admin
 * changes something, so the first save must insert.
 */
export async function writeSettings(values: Partial<PlatformSettings>) {
  const next = { ...DEFAULT_SETTINGS, ...values }

  await db
    .insert(platformSetting)
    .values({ id: SINGLETON, ...next })
    .onConflictDoUpdate({
      target: platformSetting.id,
      set: next,
    })
}
