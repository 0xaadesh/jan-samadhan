import "server-only"

const ENDPOINT =
  process.env.WHAPI_ENDPOINT ?? "https://gate.whapi.cloud/messages/text"

/**
 * Outbound WhatsApp, via the Whapi gateway.
 *
 * The token is read from the environment on every send rather than captured at
 * module load, so rotating it takes effect without a rebuild.
 */
function token() {
  return process.env.WHAPI_TOKEN ?? ""
}

export function isWhatsAppConfigured() {
  return Boolean(token())
}

/**
 * Normalise a number to the digits-only international form the gateway wants.
 *
 * Returns null for anything that cannot be one, rather than sending a
 * malformed number and getting an opaque gateway error later. A leading `+`,
 * spaces, dashes and brackets are all stripped; what must remain is a plausible
 * international number, which is 8 to 15 digits (ITU E.164 caps it at 15).
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D+/g, "")

  if (digits.length < 8 || digits.length > 15) return null

  // A number saved with a leading zero is a national trunk prefix, not part of
  // the international number, and the gateway would reject it.
  if (digits.startsWith("0")) return null

  return digits
}

/**
 * Send one WhatsApp message.
 *
 * Never throws. Notification delivery is a side effect of a complaint changing
 * state - a gateway outage must not roll back a status change or fail the
 * request that caused it. Failures are logged and reported in the return value.
 */
export async function sendWhatsApp({
  to,
  body,
}: {
  to: string
  body: string
}): Promise<{ sent: boolean; error?: string }> {
  if (!isWhatsAppConfigured()) {
    return { sent: false, error: "WhatsApp is not configured." }
  }

  const recipient = normalizePhone(to)

  if (!recipient) return { sent: false, error: "Not a usable phone number." }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ typing_time: 0, body, to: recipient }),
      // A slow gateway must not hold a status change open indefinitely.
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      console.error(
        `WhatsApp send failed (${response.status}): ${detail.slice(0, 300)}`,
      )
      return { sent: false, error: `Gateway returned ${response.status}.` }
    }

    return { sent: true }
  } catch (cause) {
    console.error("WhatsApp send failed:", cause)
    return {
      sent: false,
      error: cause instanceof Error ? cause.message : "Send failed.",
    }
  }
}
