/**
 * Field limits shared by the submission form and the server that stores it.
 *
 * Their own module, free of `server-only` and of any database import: the
 * client form needs these numbers for its `maxLength` attributes, and pulling
 * them from the data layer would drag the Postgres driver into the browser
 * bundle.
 */

export const TITLE_MAX_LENGTH = 140

export const DESCRIPTION_MAX_LENGTH = 4000

/**
 * A url-safe code derived from a name.
 *
 * Lives here rather than beside the department queries because scripts and the
 * seed run outside Next entirely - importing it from a `server-only` module
 * would throw before they could use it.
 */
export function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "dept"
  )
}
