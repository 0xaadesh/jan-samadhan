/**
 * The short reference a citizen quotes when they ring up about a complaint.
 *
 * Derived from random bytes rather than a counter: a sequential id would leak
 * the platform's total volume, and a citizen guessing GRV-000124 could probe
 * for complaints that are not theirs.
 */

import { randomBytes } from "node:crypto"

// No I, O, 0 or 1 - these are read aloud and written down by hand.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

export function newReference() {
  const bytes = randomBytes(6)
  let out = ""

  for (const byte of bytes) {
    out += ALPHABET[byte % ALPHABET.length]
  }

  return `GRV-${out}`
}
