"use client"

import * as React from "react"
import Link from "next/link"
import { MenuIcon, SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

import { useSession } from "@/lib/auth-client"

const links = [
  { href: "#features", label: "Features" },
  { href: "#workflow", label: "Workflow" },
  { href: "#faq", label: "FAQ" },
]

export function SiteNav() {
  const [open, setOpen] = React.useState(false)
  const { data: session, isPending } = useSession()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 lg:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <SparklesIcon className="size-4" />
          </span>
          Jan Samadhan
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Button
              key={link.href}
              variant="ghost"
              size="sm"
              render={<a href={link.href} />}
            >
              {link.label}
            </Button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ModeToggle />
          {isPending ? (
            <Skeleton className="h-8 w-28 rounded-md" />
          ) : session ? (
            <Button size="sm" render={<Link href="/dashboard" />}>
              Open app
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
                render={<Link href="/login" />}
              >
                Sign in
              </Button>
              <Button size="sm" render={<Link href="/signup" />}>
                Get started
              </Button>
            </>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="md:hidden"
                  aria-label="Open menu"
                />
              }
            >
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4">
                {links.map((link) => (
                  <Button
                    key={link.href}
                    variant="ghost"
                    className="justify-start"
                    onClick={() => setOpen(false)}
                    render={<a href={link.href} />}
                  >
                    {link.label}
                  </Button>
                ))}
                {!isPending && (
                  <Button
                    variant="ghost"
                    className="justify-start"
                    render={
                      <Link href={session ? "/dashboard" : "/login"} />
                    }
                  >
                    {session ? "Open app" : "Sign in"}
                  </Button>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
