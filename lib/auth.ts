import { betterAuth } from "better-auth"
import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { createAuthMiddleware, APIError } from "better-auth/api"
import { nextCookies } from "better-auth/next-js"

import { db } from "@/lib/db"
import { sendEmail } from "@/lib/email"
import * as schema from "@/lib/db/schema"

export const auth = betterAuth({
  appName: "Jan Samadhan",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  user: {
    additionalFields: {
      // Everyone signs up as a citizen; promotion is an admin action, so these
      // are not part of the signup payload. `input: false` is what stops a
      // crafted /sign-up body from setting its own role.
      role: { type: "string", required: false, defaultValue: "citizen", input: false },
      departmentId: { type: "string", required: false, input: false },
      active: { type: "boolean", required: false, defaultValue: true, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Unverified accounts cannot sign in at all, and signing up does not create
    // a session (Better Auth skips auto sign-in whenever this is on). Clicking
    // the emailed link is the only way into the app.
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your password",
        html: `
          <p>Hi ${user.name || "there"},</p>
          <p>Click the link below to choose a new password. This link expires in one hour.</p>
          <p><a href="${url}">Reset your password</a></p>
          <p>If you didn't request this, you can safely ignore this email.</p>
        `,
      })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    // Re-send the link when an unverified user tries to sign in, so a lost or
    // expired email is self-service rather than a support ticket.
    sendOnSignIn: true,
    // Clicking the link signs them in directly — no second trip to /login.
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your email address",
        html: `
          <p>Hi ${user.name || "there"},</p>
          <p>Welcome to Jan Samadhan. Confirm your email address to secure your account.</p>
          <p><a href="${url}">Verify your email</a></p>
          <p>If you didn't create this account, you can safely ignore this email.</p>
        `,
      })
    },
  },
  hooks: {
    // Better Auth's /reset-password happily accepts the password the account
    // already has. Reject that here, before the endpoint consumes the token, so
    // the link survives for the retry.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/reset-password") return

      const token = ctx.body?.token || ctx.query?.token
      const newPassword = ctx.body?.newPassword
      if (!token || !newPassword) return

      // findVerificationValue (unlike consumeVerificationValue) leaves the token
      // in place — a rejected attempt must not burn the user's reset link.
      const verification = await ctx.context.internalAdapter.findVerificationValue(
        `reset-password:${token}`,
      )
      if (!verification || verification.expiresAt < new Date()) return

      const account = await ctx.context.internalAdapter.findCredentialAccount(
        verification.value,
      )
      if (!account?.password) return

      const isSamePassword = await ctx.context.password.verify({
        password: newPassword,
        hash: account.password,
      })

      if (isSamePassword) {
        throw APIError.from("BAD_REQUEST", {
          code: "PASSWORD_MATCHES_CURRENT",
          message:
            "That is already your current password. Please choose a different one.",
        })
      }
    }),
  },
  // Must be the last plugin so it can set cookies on the outgoing response.
  plugins: [nextCookies()],
})
