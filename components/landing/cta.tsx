"use client"

import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

import { useSession } from "@/lib/auth-client"

export function Cta() {
  const { data: session } = useSession()

  return (
    <section className="border-b">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 md:py-24 lg:px-6">
        <div className="flex flex-col items-center gap-6 rounded-xl border bg-gradient-to-b from-primary/5 to-card px-6 py-14 text-center">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Report it once. Follow it to the end.
          </h2>
          <p className="max-w-xl text-lg text-muted-foreground text-balance">
            Filing takes under a minute. You will get a reference number
            immediately and an update at every step.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            {session ? (
              <Button size="lg" render={<Link href="/dashboard" />}>
                Go to my dashboard
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            ) : (
              <>
                <Button size="lg" render={<Link href="/signup" />}>
                  File a complaint
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  render={<Link href="/login" />}
                >
                  Sign in
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
