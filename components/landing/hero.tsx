"use client"

import Link from "next/link"
import { ArrowRightIcon, CheckIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { useSession } from "@/lib/auth-client"

/**
 * What a citizen actually gets, stated plainly.
 *
 * Not feature marketing: someone arriving here has a broken streetlight and
 * wants to know that reporting it will go somewhere.
 */
const highlights = [
  "Routed automatically to the right department",
  "Track every update end to end",
  "Free for all citizens",
]

export function Hero() {
  const { data: session } = useSession()

  return (
    <section className="relative overflow-hidden border-b">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--color-primary)/8%,transparent_60%)]"
      />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-4 py-20 text-center md:py-28 lg:px-6">
        <Badge variant="outline" className="h-6 gap-1.5">
          <span className="size-1.5 rounded-full bg-primary" />
          AI-assisted civic grievance redressal
        </Badge>

        <div className="flex max-w-3xl flex-col gap-5">
          <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-6xl">
            Report a civic problem. Watch it get fixed.
          </h1>
          <p className="text-lg text-muted-foreground text-balance md:text-xl">
            Describe the issue in your own words and attach a photo. It is
            classified, prioritised and routed to the department that can
            actually resolve it &mdash; and you can follow every step.
          </p>
        </div>

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
              <Button size="lg" variant="outline" render={<Link href="/login" />}>
                Track an existing one
              </Button>
            </>
          )}
        </div>

        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {highlights.map((item) => (
            <li key={item} className="flex items-center gap-1.5">
              <CheckIcon className="size-4 text-primary" />
              {item}
            </li>
          ))}
        </ul>

        {/* A worked example rather than a screenshot placeholder - it shows
            what the pipeline does in the time it takes to read three lines. */}
        <div className="mt-4 w-full max-w-3xl rounded-xl border bg-card p-2 text-left shadow-sm">
          <div className="rounded-lg border bg-gradient-to-b from-primary/5 to-card p-5">
            <p className="text-xs font-medium text-muted-foreground">
              A citizen writes
            </p>
            <p className="mt-2 text-sm">
              &ldquo;Sewage has been overflowing outside the market gate for
              three days. Children walk through it on the way to school.&rdquo;
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Department", value: "Water Supply", tone: "text-sky-600 dark:text-sky-400" },
                { label: "Priority", value: "Critical", tone: "text-red-600 dark:text-red-400" },
                { label: "Duplicate", value: "None found", tone: "text-muted-foreground" },
              ].map((item) => (
                <div className="rounded-lg border bg-background p-3" key={item.label}>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className={`mt-0.5 text-sm font-medium ${item.tone}`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Routed in seconds, with the reasoning recorded so an official can
              override it.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
