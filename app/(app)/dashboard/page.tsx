import Link from "next/link"

import { ChatSheet } from "@/components/chat/chat-sheet"
import { VoiceSheet } from "@/components/chat/voice-sheet"
import { ComplaintTable } from "@/components/complaint-table"
import { TrendChart } from "@/components/trend-chart"
import { PageBody, PageHeader, StatCard, StatGrid } from "@/components/page-shell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireViewer } from "@/lib/auth-session"
import {
  loadDepartmentWorkload,
  loadOverview,
  loadPriorityBreakdown,
  loadTrend,
} from "@/lib/grievance/analytics"
import { listComplaints } from "@/lib/grievance/complaints"
import { OPEN_STATUSES } from "@/lib/grievance/status"

/** Hours rendered the way a person would say them. */
function formatHours(hours: number | null) {
  if (hours === null) return "--"
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 48) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

export default async function DashboardPage() {
  const viewer = await requireViewer()

  const [overview, trend, priorities, recent] = await Promise.all([
    loadOverview(viewer),
    loadTrend(viewer, 30),
    loadPriorityBreakdown(viewer),
    listComplaints(viewer, { limit: 8 }),
  ])

  // Only an admin sees across departments, so only an admin gets the
  // cross-department comparison - for anyone else it would be a blank panel.
  const workload = viewer.role === "admin" ? await loadDepartmentWorkload() : []

  const isCitizen = viewer.role === "citizen"

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          isCitizen
            ? "Your complaints at a glance"
            : viewer.role === "department"
              ? `${viewer.departmentName ?? "Unassigned"} overview`
              : "Platform-wide overview"
        }
        actions={
          isCitizen ? (
            <>
              <VoiceSheet />
              <ChatSheet />
              <Button size="sm" render={<Link href="/complaints/new" />}>
                Submit a complaint
              </Button>
            </>
          ) : null
        }
      />

      <PageBody>
        <StatGrid>
          <StatCard
            label={isCitizen ? "Complaints filed" : "Total complaints"}
            value={overview.total}
            hint={`${overview.open} still open`}
          />
          <StatCard
            label="In progress"
            value={overview.inProgress}
            hint="Actively being worked"
            accent="warning"
          />
          <StatCard
            label="Resolved"
            value={overview.resolved}
            hint={
              overview.resolutionRate !== null
                ? `${Math.round(overview.resolutionRate * 100)}% resolution rate`
                : "No complaints yet"
            }
            accent="success"
          />
          {isCitizen ? (
            <StatCard
              label="Average resolution"
              value={formatHours(overview.avgResolutionHours)}
              hint="From submission to close"
            />
          ) : (
            <StatCard
              label="Awaiting triage"
              value={overview.unrouted}
              hint={`${overview.duplicates} flagged as duplicates`}
              accent={overview.unrouted > 0 ? "danger" : "default"}
            />
          )}
        </StatGrid>

        <div className="grid gap-4 @4xl/main:grid-cols-3">
          <Card className="@4xl/main:col-span-2">
            <CardHeader>
              <CardTitle>Complaint volume</CardTitle>
              <CardDescription>
                Submitted against resolved, over the last 30 days.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TrendChart data={trend} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Priority breakdown</CardTitle>
              <CardDescription>Open complaints by severity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {priorities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No priority levels configured yet.
                </p>
              ) : (
                priorities.map((entry) => {
                  const share =
                    overview.total > 0 ? entry.total / overview.total : 0

                  return (
                    <div key={entry.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="size-2 rounded-full"
                            style={{ backgroundColor: entry.color }}
                          />
                          {entry.name}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {entry.open} open / {entry.total}
                        </span>
                      </div>
                      {/* A bar rather than a pie: comparing lengths against a
                          shared baseline is far easier than comparing angles. */}
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-[width]"
                          style={{
                            width: `${Math.max(share * 100, entry.total > 0 ? 2 : 0)}%`,
                            backgroundColor: entry.color,
                          }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>

        {viewer.role === "admin" && workload.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Department performance</CardTitle>
              <CardDescription>
                Open load and average time to resolution, per department.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 @2xl/main:grid-cols-2 @5xl/main:grid-cols-3">
                {workload.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border p-3 text-sm"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{entry.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {entry.total}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <div>
                        <dt>Open</dt>
                        <dd className="font-medium tabular-nums text-foreground">
                          {entry.open}
                        </dd>
                      </div>
                      <div>
                        <dt>Resolved</dt>
                        <dd className="font-medium tabular-nums text-foreground">
                          {entry.resolved}
                        </dd>
                      </div>
                      <div>
                        <dt>Avg</dt>
                        <dd className="font-medium tabular-nums text-foreground">
                          {formatHours(entry.avgResolutionHours)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{isCitizen ? "Recent activity" : "Latest complaints"}</CardTitle>
            <CardDescription>
              {isCitizen
                ? "Your most recent submissions and where they stand."
                : "The newest complaints in your scope."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ComplaintTable rows={recent} role={viewer.role} compact />
          </CardContent>
        </Card>
      </PageBody>
    </>
  )
}
