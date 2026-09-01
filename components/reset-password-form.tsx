"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function ResetPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  // Better Auth redirects here with ?error=INVALID_TOKEN when the link is bad.
  const tokenError = searchParams.get("error")

  const [error, setError] = React.useState<string | null>(null)
  const [isPending, setIsPending] = React.useState(false)

  const isTokenUsable = Boolean(token) && !tokenError

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const formData = new FormData(event.currentTarget)
    const password = String(formData.get("password"))
    const confirmPassword = String(formData.get("confirm-password"))

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.")
      return
    }

    setIsPending(true)
    const { error } = await authClient.resetPassword({
      newPassword: password,
      token: token as string,
    })

    if (error) {
      setIsPending(false)
      // The server rejects reusing the current password without consuming the
      // token, so the user can retry on this same link.
      const message =
        error.code === "PASSWORD_MATCHES_CURRENT"
          ? "That is already your current password. Please choose a different one."
          : error.message ?? "Unable to reset your password. Please try again."
      setError(message)
      toast.error(message)
      return
    }

    toast.success("Password updated", {
      description: "Sign in with your new password.",
    })
    router.push("/login")
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Choose a new password</CardTitle>
          <CardDescription>
            Your new password must be at least 8 characters long and different
            from your current one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isTokenUsable ? (
            <FieldDescription className="text-center">
              This reset link is invalid or has expired.{" "}
              <Link
                href="/forgot-password"
                className="underline underline-offset-4"
              >
                Request a new one
              </Link>
            </FieldDescription>
          ) : (
            <form onSubmit={onSubmit}>
              <fieldset disabled={isPending}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="password">New password</FieldLabel>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="confirm-password">
                      Confirm new password
                    </FieldLabel>
                    <Input
                      id="confirm-password"
                      name="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </Field>
                  {error ? (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <Field>
                    <Button type="submit" disabled={isPending}>
                      {isPending ? <Spinner /> : null}
                      {isPending ? "Saving..." : "Reset password"}
                    </Button>
                  </Field>
                </FieldGroup>
              </fieldset>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
