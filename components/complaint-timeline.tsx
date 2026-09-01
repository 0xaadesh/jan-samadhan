import {
  CircleCheckIcon,
  CirclePlusIcon,
  LockIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  SparklesIcon,
  UserCheckIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { TimelineEntry } from "@/lib/grievance/events"

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  created: CirclePlusIcon,
  ai_triage: SparklesIcon,
  status_changed: RefreshCwIcon,
  assigned: UserCheckIcon,
  reassigned: RefreshCwIcon,
  remark: MessageSquareIcon,
  override: RefreshCwIcon,
  resolved: CircleCheckIcon,
}

/**
 * The complaint's history as a vertical thread.
 *
 * Oldest first, because this reads as a story of what happened rather than a
 * feed - the citizen wants "and then, and then", not the latest headline.
 */
export function ComplaintTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
    )
  }

  return (
    <ol className="relative space-y-5">
      {entries.map((entry, index) => {
        const Icon = ICONS[entry.type] ?? RefreshCwIcon
        const isLast = index === entries.length - 1

        return (
          <li className="relative flex gap-3" key={entry.id}>
            {/* The connector stops at the last item, so the thread does not
                trail off into empty space. */}
            {!isLast ? (
              <span
                aria-hidden
                className="absolute top-8 left-3.5 h-[calc(100%+0.5rem)] w-px bg-border"
              />
            ) : null}

            <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full border bg-background">
              <Icon className="size-3.5 text-muted-foreground" />
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-medium">{entry.message}</p>
                {entry.internal ? (
                  <Badge
                    variant="outline"
                    className="gap-1 font-normal text-muted-foreground"
                  >
                    <LockIcon className="size-3" />
                    Internal
                  </Badge>
                ) : null}
              </div>

              {entry.note ? (
                <p className="mt-1 rounded-lg border bg-muted/40 p-2.5 text-sm whitespace-pre-wrap">
                  {entry.note}
                </p>
              ) : null}

              <p className="mt-1 text-xs text-muted-foreground">
                {entry.actorName ?? "Automated triage"} &middot;{" "}
                {new Date(entry.createdAt).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
