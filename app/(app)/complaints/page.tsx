import Link from "next/link"

import { ComplaintFilters } from "@/components/complaint-filters"
import { ComplaintTable } from "@/components/complaint-table"
import { PageBody, PageHeader } from "@/components/page-shell"
import { Button } from "@/components/ui/button"
import { requireViewer } from "@/lib/auth-session"
import { listActiveDepartments, listActivePriorities } from "@/lib/grievance/admin"
import { listComplaints } from "@/lib/grievance/complaints"
import {
  toComplaintStatus,
  type ComplaintStatus,
} from "@/lib/grievance/status"

/**
 * Named views the sidebar links to.
 *
 * Keeping them here rather than encoding statuses in the sidebar URLs means
 * "what does Unassigned mean" has one answer, and the links stay readable.
 */
const VIEWS: Record<
  string,
  { label: string; status?: ComplaintStatus[]; unassigned?: boolean }
> = {
  unrouted: { label: "Awaiting triage", unassigned: true },
  // "Unclaimed" is now exactly the pre-acceptance statuses: `assigned` means a
  // named person has it, so including it here would list owned work as free.
  unassigned: { label: "Unclaimed", status: ["submitted", "triaged"] },
  active: { label: "In progress", status: ["assigned", "in_progress"] },
  resolved: { label: "Resolved", status: ["resolved"] },
}

export default async function ComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string
    status?: string
    department?: string
    priority?: string
    q?: string
  }>
}) {
  const viewer = await requireViewer()
  const params = await searchParams

  const view = params.view ? VIEWS[params.view] : undefined

  // An explicit status filter beats the view's implied one, so the filter bar
  // still works after arriving from a sidebar link.
  const status = params.status
    ? [toComplaintStatus(params.status)]
    : view?.status

  const [rows, departments, priorities] = await Promise.all([
    listComplaints(viewer, {
      status,
      departmentId: params.department,
      priorityId: params.priority,
      search: params.q,
      unassigned: view?.unassigned,
    }),
    viewer.role === "admin" ? listActiveDepartments() : Promise.resolve([]),
    listActivePriorities(),
  ])

  const isCitizen = viewer.role === "citizen"

  return (
    <>
      <PageHeader
        title={view?.label ?? (isCitizen ? "My complaints" : "Complaints")}
        description={
          isCitizen
            ? "Everything you have filed, and where it stands"
            : viewer.role === "department"
              ? `${viewer.departmentName ?? "No department"} queue`
              : "Every complaint on the platform"
        }
        actions={
          isCitizen ? (
            <Button size="sm" render={<Link href="/complaints/new" />}>
              Submit
            </Button>
          ) : null
        }
      />

      <PageBody>
        <ComplaintFilters
          departments={departments}
          priorities={priorities}
          showDepartment={viewer.role === "admin"}
        />

        <ComplaintTable
          rows={rows}
          role={viewer.role}
          emptyTitle={
            params.q || params.status || params.department || params.priority
              ? "No complaints match these filters"
              : isCitizen
                ? "You have not filed any complaints yet"
                : "Nothing in this queue"
          }
          emptyDescription={
            isCitizen
              ? "When you submit a complaint it appears here, with its status and every update from the department handling it."
              : "Complaints will appear here as citizens file them and the AI routes them."
          }
          emptyAction={
            isCitizen ? (
              <Button size="sm" render={<Link href="/complaints/new" />}>
                Submit a complaint
              </Button>
            ) : null
          }
        />

        {rows.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Showing {rows.length} complaint{rows.length === 1 ? "" : "s"}.
          </p>
        ) : null}
      </PageBody>
    </>
  )
}
