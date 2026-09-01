"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [isPending, setIsPending] = React.useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email"))
    const password = String(formData.get("password"))

    setIsPending(true)
    const { error } = await authClient.signIn.email({ email, password })

    if (error) {
      setIsPending(false)
      // sendOnSignIn already mailed a fresh link, so tell the user to use it
      // rather than showing the raw "email not verified" error.
      if (error.code === "EMAIL_NOT_VERIFIED") {
        const message =
          "Please verify your email first. We just sent a new link to " +
          `${email}.`
        setError(message)
        toast.info("Verification required", { description: message, duration: 8000 })
        return
      }
      setError(error.message ?? "Unable to sign in. Please try again.")
      return
    }

    // Stay pending through the navigation — the form should not look clickable
    // again while the chat is being fetched.
    toast.success("Welcome back!")
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={onSubmit}>
            <fieldset disabled={isPending}>
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="text-2xl font-bold">Welcome back</h1>
                  <p className="text-balance text-muted-foreground">
                    Login to your Acme Inc account
                  </p>
                </div>
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
                <Field>
                  <div className="flex items-center">
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Link
                      href="/forgot-password"
                      className="ml-auto text-sm underline-offset-2 hover:underline aria-disabled:pointer-events-none aria-disabled:opacity-50"
                      aria-disabled={isPending}
                      tabIndex={isPending ? -1 : undefined}
                    >
                      Forgot your password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
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
                    {isPending ? "Signing in..." : "Login"}
                  </Button>
                </Field>
                <FieldDescription className="text-center">
                  Don&apos;t have an account?{" "}
                  <Link href="/signup" className="underline underline-offset-4">
                    Sign up
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
