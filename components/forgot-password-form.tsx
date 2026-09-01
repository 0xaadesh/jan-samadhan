"use client"

import * as React from "react"
import Link from "next/link"
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

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [error, setError] = React.useState<string | null>(null)
  const [isPending, setIsPending] = React.useState(false)
  const [sent, setSent] = React.useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email"))

    setIsPending(true)
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    })
    setIsPending(false)

    if (error) {
      setError(error.message ?? "Unable to send the reset link. Please try again.")
      return
    }

    toast.success("Reset link sent", {
      description: `If an account exists for ${email}, the link is on its way.`,
    })
    setSent(true)
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Forgot your password?</CardTitle>
          <CardDescription>
            {sent
              ? "Check your inbox for the reset link."
              : "Enter your email and we'll send you a link to reset it."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <FieldDescription className="text-center">
              If an account exists for that email, a reset link is on its way.{" "}
              <Link href="/login" className="underline underline-offset-4">
                Back to login
              </Link>
            </FieldDescription>
          ) : (
            <form onSubmit={onSubmit}>
              <fieldset disabled={isPending}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="m@example.com"
                      autoComplete="email"
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
                      {isPending ? "Sending..." : "Send reset link"}
                    </Button>
                  </Field>
                  <FieldDescription className="text-center">
                    Remembered it?{" "}
                    <Link href="/login" className="underline underline-offset-4">
                      Back to login
                    </Link>
                  </FieldDescription>
                </FieldGroup>
              </fieldset>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
