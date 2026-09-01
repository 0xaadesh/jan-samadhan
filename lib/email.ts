import { Resend } from "resend"

const from = process.env.EMAIL_FROM ?? "Acme <onboarding@resend.dev>"

// Constructed lazily: the Resend client throws at construction when the API key
// is missing. At module scope that would take down everything importing this
// file — lib/auth.ts, and so every route handler and session check with it.
let client: Resend | null = null

function getClient() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  client ??= new Resend(apiKey)
  return client
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  const resend = getClient()

  if (!resend) {
    // A dropped email is an invisible failure in production, so only tolerate a
    // missing key in development.
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set")
    }
    console.warn(`[email] RESEND_API_KEY missing — would have sent "${subject}" to ${to}`)
    return
  }

  const { error } = await resend.emails.send({ from, to, subject, html })

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`)
  }
}
