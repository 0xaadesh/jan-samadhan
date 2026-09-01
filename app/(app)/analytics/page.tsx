import Link from "next/link"
import { MapPinIcon } from "lucide-react"

import { TrendChart } from "@/components/trend-chart"
import {
  EmptyState,
  PageBody,
  PageHeader,
  StatCard,
  StatGrid,
} from "@/components/page-shell"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireStaff } from "@/lib/auth-session"
import {
  loadDepartmentWorkload,
  loadHotspots,
  loadOverview,
  loadPriorityBreakdown,
  loadTrend,
} from "@/lib/grievance/analytics"

function formatHours(hours: number | null) {
  if (hours === null) return "--"
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 48) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

export default async function AnalyticsPage() {
  const viewer = await requireStaff()

  const isAdmin = viewer.role === "admin"

  const [overview, trend, priorities, workload, hotspots] = await Promise.all([
    loadOverview(viewer),
    loadTrend(viewer, 90),
    loadPriorityBreakdown(viewer),
    isAdmin ? loadDepartmentWorkload() : Promise.resolve([]),
    isAdmin ? loadHotspots() : Promise.resolve([]),
  ])

  return (
    <>
      <PageHeader
        title="Analytics"
        description={
          isAdmin
            ? "Platform-wide trends, workload and hotspots"
            : `${viewer.departmentName ?? "Your department"} performance`
        }
      />

      <PageBody>
        <StatGrid>
          <StatCard
            label="Total complaints"
            value={overview.total}
            hint={`${overview.open} open`}
          />
          <StatCard
            label="Resolution rate"
            value={
              overview.resolutionRate !== null
                ? `${Math.round(overview.resolutionRate * 100)}%`
                : "--"
            }
            hint={`${overview.resolved} resolved`}
            accent="success"
          />
          <StatCard
            label="Average resolution"
            value={formatHours(overview.avgResolutionHours)}
            hint="Submission to close"
          />
          <StatCard
            label="Duplicates detected"
            value={overview.duplicates}
            hint="Folded into an earlier report"
          />
        </StatGrid>

        <Card>
          <CardHeader>
            <CardTitle>Complaint trend</CardTitle>
            <CardDescription>
              Submitted against resolved, over the last 90 days. When the two
              lines diverge, the backlog is growing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={trend} />
          </CardContent>
        </Card>

        <div className="grid gap-4 @4xl/main:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Priority mix</CardTitle>
              <CardDescription>
                How the caseload is distributed across severity.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {priorities.map((entry) => {
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
                        {entry.total} ({Math.round(share * 100)}%)
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(share * 100, entry.total > 0 ? 2 : 0)}%`,
                          backgroundColor: entry.color,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Geographic hotspots</CardTitle>
                <CardDescription>
                  Grid cells with more than one complaint - where problems
                  cluster.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {hotspots.length === 0 ? (
                  <EmptyState
                    icon={<MapPinIcon className="size-6" />}
                    title="No clusters yet"
                    description="Hotspots appear once several complaints are filed with coordinates in the same area."
                  />
                ) : (
                  <ul className="space-y-2">
                    {hotspots.map((spot) => {
                      if (
                        typeof spot.latitude !== "number" ||
                        typeof spot.longitude !== "number" ||
                        !Number.isFinite(spot.latitude) ||
                        !Number.isFinite(spot.longitude)
                      ) {
                        return null
                      }

                      return (
                        <li
                          className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm"
                          key={spot.cell}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {spot.sample ?? "Unnamed area"}
                            </p>
                            <a
                              className="font-mono text-xs text-muted-foreground underline-offset-4 hover:underline"
                              href={`https://www.openstreetmap.org/#map=15/${spot.latitude}/${spot.longitude}`}
                              rel="noreferrer noopener"
                              target="_blank"
                            >
                              {spot.latitude.toFixed(3)},{" "}
                              {spot.longitude.toFixed(3)}
                            </a>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-medium tabular-nums">
                              {spot.total}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {spot.open} open
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {isAdmin && workload.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Department workload</CardTitle>
              <CardDescription>
                Where the load sits, and how quickly each team clears it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {workload.map((entry) => {
                const busiest = workload[0]?.total || 1
                const share = entry.total / busiest

                return (
                  <div className="space-y-1.5" key={entry.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{entry.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {entry.open} open / {entry.total} total &middot;{" "}
                        {formatHours(entry.avgResolutionHours)} avg
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.max(share * 100, entry.total > 0 ? 2 : 0)}%`,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ) : null}
      </PageBody>
    </>
  )
}
