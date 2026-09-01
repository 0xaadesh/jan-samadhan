"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

/**
 * Re-fetch the page while any complaint on it is still being triaged.
 *
 * Triage runs detached from the request that started it, so nothing pushes its
 * result to a page that is already rendered. Rather than open a socket for a
 * pass that finishes in seconds, this polls `router.refresh()` - a server
 * re-render of the same route - and stops the moment nothing is pending.
 *
 * `until` is how long the newest pending complaint has left in its grace
 * window, so the poll ends on its own even if a pass dies silently.
 */
export function TriageRefresher({
  pending,
  until,
  intervalMs = 4000,
}: {
  /** How many complaints on this page are mid-triage. */
  pending: number
  /** Milliseconds before the last of them stops counting as triaging. */
  until: number
  intervalMs?: number
}) {
  const router = useRouter()

  React.useEffect(() => {
    if (pending === 0 || until <= 0) return

    const poll = setInterval(() => router.refresh(), intervalMs)

    // A hard stop, so a failed pass cannot leave this polling forever.
    const stop = setTimeout(() => clearInterval(poll), until)

    return () => {
      clearInterval(poll)
      clearTimeout(stop)
    }
  }, [pending, until, intervalMs, router])

  return null
}
