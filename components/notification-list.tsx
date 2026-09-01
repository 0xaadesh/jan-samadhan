"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { BellIcon, CheckCheckIcon } from "lucide-react"
import { toast } from "sonner"

import { EmptyState } from "@/components/page-shell"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/grievance/actions"
import type { NotificationView } from "@/lib/grievance/events"

export function NotificationList({
  notifications,
}: {
  notifications: NotificationView[]
}) {
  const router = useRouter()
  const [isPending, setIsPending] = React.useState(false)

  const unread = notifications.filter((entry) => !entry.read).length

  const markAll = async () => {
    if (isPending) return

    setIsPending(true)

    try {
      await markAllNotificationsReadAction()
      router.refresh()
    } catch {
      toast.error("Could not mark those as read.")
    } finally {
      setIsPending(false)
    }
  }

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={<BellIcon className="size-8" />}
        title="Nothing yet"
        description="When a department updates one of your complaints, or its status changes, you will hear about it here."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {unread > 0 ? `${unread} unread` : "All caught up"}
        </p>
        {unread > 0 ? (
          <Button disabled={isPending} onClick={markAll} size="sm" variant="ghost">
            {isPending ? <Spinner /> : <CheckCheckIcon />}
            Mark all read
          </Button>
        ) : null}
      </div>

      <ul className="space-y-2">
        {notifications.map((entry) => {
          const body = (
            <div
              className={cn(
                "rounded-xl border p-3 transition-colors",
                !entry.read && "border-primary/25 bg-primary/4",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {/* An unread marker rather than bold text alone - colour is
                        not the only channel carrying the distinction. */}
                    {!entry.read ? (
                      <span
                        aria-label="Unread"
                        className="mr-2 inline-block size-1.5 rounded-full bg-primary align-middle"
                      />
                    ) : null}
                    {entry.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {entry.body}
                  </p>
                </div>
                <time className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </time>
              </div>
            </div>
          )

          return (
            <li key={entry.id}>
              {entry.complaintId ? (
                <Link
                  href={`/complaints/${entry.complaintId}`}
                  onClick={() => {
                    // Opening it is the read receipt; fired without awaiting so
                    // navigation is not held up by the write.
                    if (!entry.read) {
                      void markNotificationReadAction(entry.id)
                    }
                  }}
                >
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
