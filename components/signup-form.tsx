"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { MailCheckIcon } from "lucide-react"

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

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [error, setError] = React.useState<string | null>(null)
  const [isPending, setIsPending] = React.useState(false)
  // requireEmailVerification means signup creates no session, so there is no
  // app to land on — the user must click the emailed link first.
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const [isResending, setIsResending] = React.useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const formData = new FormData(event.currentTarget)
    const name = String(formData.get("name"))
    const email = String(formData.get("email"))
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
    const { error } = await authClient.signUp.email({ name, email, password })

    if (error) {
      setIsPending(false)
      setError(error.message ?? "Unable to create your account. Please try again.")
      return
    }

    setIsPending(false)
    toast.success("Account created", {
      description: `We sent a verification link to ${email}.`,
      duration: 8000,
    })
    setSentTo(email)
  }

  async function handleResend() {
    if (!sentTo) return
    setIsResending(true)
    const { error } = await authClient.sendVerificationEmail({ email: sentTo })
    setIsResending(false)

    if (error) {
      toast.error(error.message ?? "Unable to resend the link. Please try again.")
      return
    }

    toast.success(`We sent another link to ${sentTo}.`)
  }

  if (sentTo) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card>
          <CardHeader className="items-center text-center">
            <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10">
              <MailCheckIcon className="size-5 text-primary" />
            </div>
            <CardTitle className="text-2xl">Check your inbox</CardTitle>
            <CardDescription>
              We sent a verification link to{" "}
              <span className="font-medium text-foreground">{sentTo}</span>.
              Click it to activate your account and sign in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <Button
                  variant="outline"
                  onClick={handleResend}
                  disabled={isResending}
                >
                  {isResending ? <Spinner /> : null}
                  {isResending ? "Resending..." : "Resend the link"}
                </Button>
              </Field>
              <FieldDescription className="text-center">
                Wrong address?{" "}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => setSentTo(null)}
                >
                  Go back
                </button>
              </FieldDescription>
              <FieldDescription className="text-center">
                Already verified?{" "}
                <Link href="/login" className="underline underline-offset-4">
                  Sign in
                </Link>
              </FieldDescription>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={onSubmit}>
            <fieldset disabled={isPending}>
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="text-2xl font-bold">Create your account</h1>
                  <p className="text-sm text-balance text-muted-foreground">
                    Enter your details below to create your account
                  </p>
                </div>
                <Field>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="Ada Lovelace"
                    autoComplete="name"
                    required
                  />
                </Field>
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
                  <FieldDescription>
                    We&apos;ll send a verification link here to confirm it&apos;s
                    yours. We will not share your email with anyone else.
                  </FieldDescription>
                </Field>
                <Field>
                  <Field className="grid grid-cols-2 gap-4">
                    <Field>
                      <FieldLabel htmlFor="password">Password</FieldLabel>
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
                        Confirm Password
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
                  </Field>
                  <FieldDescription>
                    Must be at least 8 characters long.
                  </FieldDescription>
                </Field>
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <Field>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? <Spinner /> : null}
                    {isPending ? "Creating account..." : "Create Account"}
                  </Button>
                </Field>
                <FieldDescription className="text-center">
                  Already have an account?{" "}
                  <Link href="/login" className="underline underline-offset-4">
                    Sign in
                  </Link>
                </FieldDescription>
              </FieldGroup>
            </fieldset>
          </form>
          <div className="relative hidden bg-muted md:block">
            <img
              src="/placeholder.svg"
              alt=""
              className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
            />
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
        and <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  )
}
