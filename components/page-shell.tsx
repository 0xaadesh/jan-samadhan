import * as React from "react"

import { ModeToggle } from "@/components/mode-toggle"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

/**
 * The header every page inside the app shell wears.
 *
 * `actions` is a slot rather than a prop shape, because what belongs beside a
 * title differs per page - a filter bar here, a submit button there.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/80 backdrop-blur-sm">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <div className="min-w-0">
          <h1 className="truncate text-base font-medium">{title}</h1>
          {description ? (
            <p className="truncate text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {actions}
          <ModeToggle />
        </div>
      </div>
    </header>
  )
}

/** The standard content well - consistent gutters and rhythm on every page. */
export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="@container/main flex flex-1 flex-col">
      <div className={cn("flex flex-col gap-6 p-4 lg:p-6", className)}>
        {children}
      </div>
    </div>
  )
}

/**
 * One headline number.
 *
 * `hint` carries the context that stops a bare figure being useless - "12 of
 * them unrouted" says more than "47".
 */
export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  /** Tints the figure, for the one stat on a page that needs attention. */
  accent?: "default" | "warning" | "danger" | "success"
}) {
  return (
    <Card className="@container/card bg-linear-to-t from-primary/4 to-card shadow-xs dark:bg-card">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            "text-2xl font-semibold tabular-nums @[220px]/card:text-3xl",
            accent === "warning" && "text-amber-600 dark:text-amber-400",
            accent === "danger" && "text-red-600 dark:text-red-400",
            accent === "success" && "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {value}
        </CardTitle>
        {hint ? (
          <div className="text-xs text-muted-foreground">{hint}</div>
        ) : null}
      </CardHeader>
    </Card>
  )
}

/** The responsive row the stat cards sit in. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {children}
    </div>
  )
}

/** What a list shows when it has nothing in it - never a blank panel. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description ? (
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  )
}
