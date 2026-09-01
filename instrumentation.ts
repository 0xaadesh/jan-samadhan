/**
 * Runs once when the server process starts.
 *
 * Complaints that were mid-triage when the process died are left in
 * "submitted" with no department - which is a working state the manual triage
 * queue already surfaces, so there is nothing to sweep. This hook stays as the
 * place that work would go.
 */
export async function register() {
  // Node-only work belongs behind this guard; the edge runtime imports this
  // file too and must not pull in the database driver.
  if (process.env.NEXT_RUNTIME !== "nodejs") return
}
