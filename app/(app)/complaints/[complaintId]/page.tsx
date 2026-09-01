import Link from "next/link"
import { notFound } from "next/navigation"
import { desc, eq } from "drizzle-orm"
import { MapPinIcon, SparklesIcon } from "lucide-react"

import { ComplaintActions } from "@/components/complaint-actions"
import {
  ConfidenceBadge,
  DuplicateBadge,
  PriorityBadge,
  StatusBadge,
  TriagingBadge,
} from "@/components/complaint-badges"
import { ComplaintTimeline } from "@/components/complaint-timeline"
import { TriageRefresher } from "@/components/triage-refresher"
import { PageBody, PageHeader } from "@/components/page-shell"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { requireViewer } from "@/lib/auth-session"
import { db } from "@/lib/db"
import { aiDecision } from "@/lib/db/schema"
import { listActiveDepartments, listActivePriorities } from "@/lib/grievance/admin"
import { loadComplaint } from "@/lib/grievance/complaints"
import { loadTimeline } from "@/lib/grievance/events"
import { isTriaging, triageTimeRemaining } from "@/lib/grievance/triage-state"
import { isStaff } from "@/lib/roles"

/** Human labels for the decision kinds the pipeline records. */
const DECISION_LABEL: Record<string, string> = {
  classification: "Department",
  prioritization: "Priority",
  duplicate: "Duplicate check",
}

export default async function ComplaintDetailPage({
  params,
}: {
  params: Promise<{ complaintId: string }>
}) {
  const viewer = await requireViewer()
  const { complaintId } = await params

  // Authorisation is inside the query - a complaint outside the viewer's
  // scope is indistinguishable from one that does not exist.
  const complaint = await loadComplaint(complaintId, viewer)

  if (!complaint) notFound()

  const staff = isStaff(viewer.role)

  // The pass runs detached from submission, so a citizen arriving straight
  // from the form sees this true for a few seconds.
  const pending = isTriaging(complaint)

  const [timeline, decisions, departments, priorities] = await Promise.all([
    loadTimeline(complaintId, staff),
    staff
      ? db
          .select()
          .from(aiDecision)
          .where(eq(aiDecision.complaintId, complaintId))
          .orderBy(desc(aiDecision.createdAt))
      : Promise.resolve([]),
    staff ? listActiveDepartments() : Promise.resolve([]),
    staff ? listActivePriorities() : Promise.resolve([]),
  ])

  return (
    <>
      <PageHeader
        title={complaint.reference}
        description={complaint.title}
        actions={<StatusBadge status={complaint.status} />}
      />

      <PageBody>
        <TriageRefresher
          pending={pending ? 1 : 0}
          until={triageTimeRemaining(complaint.createdAt)}
        />

        {/* Said once, in plain words - a citizen who just submitted should not
            have to infer what the pulsing placeholders mean. */}
        {pending ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-dashed bg-muted/40 p-3 text-sm">
            <span className="mt-1.5 size-2 shrink-0 animate-pulse rounded-full bg-primary" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">
                Your complaint is being triaged.
              </span>{" "}
              It is being read, routed to the right department and ranked for
              urgency. This page updates on its own - no need to refresh.
            </p>
          </div>
        ) : null}

        <div className="grid gap-6 @4xl/main:grid-cols-3">
          <div className="space-y-6 @4xl/main:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{complaint.title}</CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-2 pt-1">
                  {pending && !complaint.priorityName ? (
                    <TriagingBadge label="Ranking priority" />
                  ) : (
                    <PriorityBadge
                      name={complaint.priorityName}
                      color={complaint.priorityColor}
                      severity={complaint.prioritySeverity}
                    />
                  )}
                  {complaint.departmentName ? (
                    <Badge variant="secondary" className="font-normal">
                      {complaint.departmentName}
                    </Badge>
                  ) : pending ? (
                    <TriagingBadge label="Finding department" />
                  ) : (
                    <Badge variant="outline" className="font-normal text-muted-foreground">
                      Awaiting triage
                    </Badge>
                  )}
                  {complaint.duplicateOfReference ? (
                    <DuplicateBadge reference={complaint.duplicateOfReference} />
                  ) : null}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {complaint.description}
                </p>

                {complaint.locationText || complaint.latitude ? (
                  <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
                    <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div>
                      {complaint.locationText ? (
                        <p>{complaint.locationText}</p>
                      ) : null}
                      {typeof complaint.latitude === "number" &&
                      typeof complaint.longitude === "number" &&
                      Number.isFinite(complaint.latitude) &&
                      Number.isFinite(complaint.longitude) ? (
                        <a
                          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                          href={`https://www.openstreetmap.org/?mlat=${complaint.latitude}&mlon=${complaint.longitude}#map=18/${complaint.latitude}/${complaint.longitude}`}
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          {complaint.latitude.toFixed(5)},{" "}
                          {complaint.longitude.toFixed(5)} - open map
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {complaint.images.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {complaint.images.map((image) => (
                      <a
                        className="group relative aspect-4/3 overflow-hidden rounded-lg border"
                        href={image.url}
                        key={image.id}
                        rel="noreferrer noopener"
                        target="_blank"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt={image.fileName}
                          className="size-full object-cover transition-transform group-hover:scale-105"
                          src={image.url}
                        />
                      </a>
                    ))}
                  </div>
                ) : null}

                {complaint.resolutionNote ? (
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/8 p-3">
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      Resolution
                    </p>
                    <p className="mt-1 text-sm whitespace-pre-wrap">
                      {complaint.resolutionNote}
                    </p>
                  </div>
                ) : null}

                <Separator />

                <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Filed by</dt>
                    <dd className="mt-0.5 font-medium">
                      {viewer.role === "citizen" ? "You" : complaint.citizenName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Submitted</dt>
                    <dd className="mt-0.5 font-medium">
                      {new Date(complaint.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Assignee</dt>
                    <dd className="mt-0.5 font-medium">
                      {complaint.assigneeName ?? "Unclaimed"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Photos</dt>
                    <dd className="mt-0.5 font-medium">
                      {complaint.images.length}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            {/* The AI's reasoning, shown to staff only. A citizen sees the
                outcome in their timeline; the confidence and the alternatives
                are an operational tool, not a public explanation. */}
            {staff && decisions.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <SparklesIcon className="size-4" />
                    AI triage
                  </CardTitle>
                  <CardDescription>
                    What the pipeline decided, and why. Any of it can be
                    overridden from the panel on the right.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {decisions.map((decision) => (
                    <div
                      className="rounded-lg border p-3 text-sm"
                      key={decision.id}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {DECISION_LABEL[decision.kind] ?? decision.kind}
                        </span>
                        {decision.outcomeLabel ? (
                          <Badge variant="secondary" className="font-normal">
                            {decision.outcomeLabel}
                          </Badge>
                        ) : null}
                        <ConfidenceBadge value={decision.confidence} />
                        {decision.overridden ? (
                          <Badge
                            variant="outline"
                            className="font-normal text-muted-foreground"
                          >
                            Overridden
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {decision.reason}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity</CardTitle>
                <CardDescription>
                  Every update on this complaint, newest last.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ComplaintTimeline entries={timeline} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {staff ? (
              <ComplaintActions
                complaintId={complaint.id}
                status={complaint.status}
                departmentId={complaint.departmentId}
                priorityId={complaint.priorityId}
                assigneeId={complaint.assigneeId}
                assigneeName={complaint.assigneeName}
                departmentName={complaint.departmentName}
                viewerId={viewer.id}
                viewerRole={viewer.role}
                hasDuplicate={Boolean(complaint.duplicateOfId)}
                departments={departments}
                priorities={priorities}
                canRetriage={viewer.role === "admin"}
              />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Status</CardTitle>
                  <CardDescription>
                    You will be notified as this progresses.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Current</span>
                    <StatusBadge status={complaint.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Department</span>
                    {complaint.departmentName ? (
                      <span className="font-medium">
                        {complaint.departmentName}
                      </span>
                    ) : pending ? (
                      <TriagingBadge label="Routing" />
                    ) : (
                      <span className="font-medium">Being assigned</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Priority</span>
                    {pending && !complaint.priorityName ? (
                      <TriagingBadge label="Ranking" />
                    ) : (
                      <PriorityBadge
                        name={complaint.priorityName}
                        color={complaint.priorityColor}
                        severity={complaint.prioritySeverity}
                      />
                    )}
                  </div>

                  {complaint.duplicateOfId ? (
                    <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                      This has been linked to{" "}
                      <Link
                        className="font-medium underline underline-offset-4"
                        href={`/complaints/${complaint.duplicateOfId}`}
                      >
                        {complaint.duplicateOfReference}
                      </Link>
                      , an earlier report of the same issue. Both are tracked
                      together, and you will still be told when it is resolved.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </PageBody>
    </>
  )
}
