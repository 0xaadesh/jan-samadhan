export const SETTINGS_SECTIONS = {
  profile: "Profile",
  account: "Account",
} as const

export type SettingsSectionId = keyof typeof SETTINGS_SECTIONS

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = "profile"

const SETTINGS_HASH_PREFIX = "#settings/"

/** Builds the hash for a section, e.g. `#settings/profile`. */
export function settingsHash(section: SettingsSectionId) {
  return `${SETTINGS_HASH_PREFIX}${section}`
}

/**
 * Reads a section out of a location hash. Returns `null` when the hash does
 * not address the settings dialog at all, which is what keeps it closed.
 */
export function parseSettingsHash(hash: string): SettingsSectionId | null {
  if (!hash.startsWith(SETTINGS_HASH_PREFIX)) return null

  const section = hash.slice(SETTINGS_HASH_PREFIX.length)
  return section in SETTINGS_SECTIONS
    ? (section as SettingsSectionId)
    : DEFAULT_SETTINGS_SECTION
}
