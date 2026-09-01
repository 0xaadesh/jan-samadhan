import Link from "next/link"
import { ImageIcon, InboxIcon, MapPinIcon } from "lucide-react"

import {
  DuplicateBadge,
  PriorityBadge,
  StatusBadge,
  TriagingBadge,
} from "@/components/complaint-badges"
import { EmptyState } from "@/components/page-shell"
import { TriageRefresher } from "@/components/triage-refresher"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ComplaintRow } from "@/lib/grievance/complaints"
import { isTriaging, triageTimeRemaining } from "@/lib/grievance/triage-state"
import type { Role } from "@/lib/roles"

/** "3h ago", "yesterday" - a filed complaint is judged by how long it has sat. */
function relativeTime(date: Date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)

  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 172800) return "yesterday"
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`

  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/**
 * The one complaint list, shared by every role.
 *
 * Columns are chosen by role rather than by page: a citizen has no use for a
 * "citizen" column on their own complaints, and a department user does not
 * need a "department" column when every row is their own department.
 */
export function ComplaintTable({
  rows,
  role,
  compact = false,
  emptyTitle = "No complaints yet",
  emptyDescription,
  emptyAction,
}: {
  rows: ComplaintRow[]
  role: Role
  /** Drops the lower-value columns, for dashboard panels. */
  compact?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<InboxIcon className="size-8" />}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    )
  }

  // Rows whose AI pass has not landed yet - they show placeholders and drive
  // the poll that replaces them.
  const triaging = rows.filter(isTriaging)

  const until = triaging.reduce(
    (longest, row) => Math.max(longest, triageTimeRemaining(row.createdAt)),
    0,
  )

  const showCitizen = role !== "citizen"
  const showDepartment = role === "admin" && !compact
  const showAssignee = role !== "citizen" && !compact

  return (
    <div className="overflow-x-auto">
      <TriageRefresher pending={triaging.length} until={until} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[110px]">Reference</TableHead>
            <TableHead className="min-w-[220px]">Complaint</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            {showDepartment ? <TableHead>Department</TableHead> : null}
            {showCitizen ? <TableHead>Citizen</TableHead> : null}
            {showAssignee ? <TableHead>Assignee</TableHead> : null}
            <TableHead className="text-right">Filed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const pending = isTriaging(row)

            return (
            <TableRow key={row.id} className="group">
              <TableCell className="font-mono text-xs">
                <Link
                  href={`/complaints/${row.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {row.reference}
                </Link>
              </TableCell>

              <TableCell>
                <Link
                  href={`/complaints/${row.id}`}
                  className="block max-w-[380px] truncate font-medium underline-offset-4 group-hover:underline"
                >
                  {row.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {row.locationText ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPinIcon className="size-3" />
                      <span className="max-w-[200px] truncate">
                        {row.locationText}
                      </span>
                    </span>
                  ) : null}
                  {row.imageCount > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <ImageIcon className="size-3" />
                      {row.imageCount}
                    </span>
                  ) : null}
                  {row.duplicateOfReference ? (
                    <DuplicateBadge reference={row.duplicateOfReference} />
                  ) : null}
                </div>
              </TableCell>

              <TableCell>
                <StatusBadge status={row.status} />
              </TableCell>

              <TableCell>
                {pending && !row.priorityName ? (
                  <TriagingBadge label="Ranking" />
                ) : (
                  <PriorityBadge
                    name={row.priorityName}
                    color={row.priorityColor}
                    severity={row.prioritySeverity}
                  />
                )}
              </TableCell>

              {showDepartment ? (
                <TableCell className="text-sm">
                  {pending && !row.departmentName ? (
                    <TriagingBadge label="Routing" />
                  ) : (
                    row.departmentName ?? (
                      <span className="text-muted-foreground">Unrouted</span>
                    )
                  )}
                </TableCell>
              ) : null}

              {showCitizen ? (
                <TableCell className="max-w-[160px] truncate text-sm">
                  {row.citizenName}
                </TableCell>
              ) : null}

              {showAssignee ? (
                <TableCell className="max-w-[160px] truncate text-sm">
                  {row.assigneeName ?? (
                    <span className="text-muted-foreground">Unclaimed</span>
                  )}
                </TableCell>
              ) : null}

              <TableCell className="text-right text-xs whitespace-nowrap text-muted-foreground">
                {relativeTime(row.createdAt)}
              </TableCell>
            </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
