"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  acceptComplaintAction,
  addRemarkAction,
  changeStatusAction,
  clearDuplicateAction,
  overrideDepartmentAction,
  overridePriorityAction,
  retriageAction,
} from "@/lib/grievance/actions"
import {
  isAwaitingAcceptance,
  nextStatuses,
  STATUS_INFO,
  type ComplaintStatus,
} from "@/lib/grievance/status"
import type { Role } from "@/lib/roles"

/**
 * Everything a department user or admin can do to one complaint.
 *
 * All of it lives in one panel rather than scattered across the page, because
 * these are the actions someone works a queue with - they should be in one
 * predictable place on every complaint.
 */
export function ComplaintActions({
  complaintId,
  status,
  departmentId,
  priorityId,
  assigneeId,
  assigneeName,
  departmentName,
  viewerId,
  viewerRole,
  hasDuplicate,
  departments,
  priorities,
  canRetriage,
}: {
  complaintId: string
  status: ComplaintStatus
  departmentId: string | null
  priorityId: string | null
  assigneeId: string | null
  /** Shown to an admin in place of the buttons they no longer get. */
  assigneeName: string | null
  departmentName: string | null
  viewerId: string
  /** Admins oversee and route; only department users take ownership. */
  viewerRole: Role
  hasDuplicate: boolean
  departments: { id: string; name: string }[]
  priorities: { id: string; name: string }[]
  canRetriage: boolean
}) {
  const router = useRouter()

  const [pending, setPending] = React.useState<string | null>(null)
  const [note, setNote] = React.useState("")
  const [internal, setInternal] = React.useState(false)
  const [resolution, setResolution] = React.useState("")

  /** One wrapper so every action gets the same spinner, toast and refresh. */
  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    if (pending) return

    setPending(key)

    try {
      await action()
      toast.success(success)
      router.refresh()
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "That did not work.",
      )
    } finally {
      setPending(null)
    }
  }

  const isAdmin = viewerRole === "admin"
  const isMine = assigneeId === viewerId

  // Who may do what. An admin routes and oversees; the department that holds
  // the work is the only party that can accept it or move it along.
  const canAccept = viewerRole === "department" && !isMine
  const canChangeStatus = viewerRole === "department"
  const canReroute = isAdmin

  const transitions = canChangeStatus ? nextStatuses(status) : []
  const awaitingAcceptance = isAwaitingAcceptance(status, assigneeId)

  // Base UI's Select shows the raw value in its trigger unless Root gets an
  // `items` map - without these a routed complaint displays a bare uuid.
  const departmentItems = React.useMemo<Record<string, string>>(
    () => Object.fromEntries(departments.map((e) => [e.id, e.name])),
    [departments],
  )

  const priorityItems = React.useMemo<Record<string, string>>(
    () => Object.fromEntries(priorities.map((e) => [e.id, e.name])),
    [priorities],
  )

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isAdmin ? "Status" : "Actions"}
          </CardTitle>
          <CardDescription>
            {isAdmin
              ? awaitingAcceptance
                ? departmentName
                  ? `Waiting for ${departmentName} to accept this complaint.`
                  : "Not routed yet - assign a department below."
                : `Owned by ${assigneeName ?? "the department"}. Only they can move it forward.`
              : isMine
                ? "You own this complaint."
                : assigneeId
                  ? "Accepted by someone else in your department."
                  : "Unclaimed - accept it to take ownership."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* An admin sees where the work sits, not buttons to do it. Resolving
              is a claim only the department that did the work can honestly
              make, so there is nothing here for an admin to press. */}
          {isAdmin ? (
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Department</dt>
                <dd className="font-medium">
                  {departmentName ?? "Unrouted"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Accepted by</dt>
                <dd className="font-medium">
                  {assigneeName ?? "Not yet accepted"}
                </dd>
              </div>
            </dl>
          ) : null}

          {canAccept ? (
            <Button
              className="w-full"
              disabled={pending !== null}
              onClick={() =>
                run(
                  "accept",
                  () => acceptComplaintAction(complaintId),
                  "Accepted - this complaint is now yours.",
                )
              }
            >
              {pending === "accept" ? <Spinner /> : null}
              Accept this complaint
            </Button>
          ) : null}

          {transitions.length > 0 ? (
          <Field>
            <FieldLabel>Move to</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              {transitions.map((next) => (
                <Button
                  disabled={pending !== null}
                  key={next}
                  onClick={() =>
                    run(
                      `status-${next}`,
                      () =>
                        changeStatusAction(
                          complaintId,
                          next,
                          next === "resolved" ? resolution : undefined,
                        ),
                      `Moved to ${STATUS_INFO[next].label.toLowerCase()}.`,
                    )
                  }
                  size="sm"
                  variant={next === "resolved" ? "default" : "outline"}
                >
                  {pending === `status-${next}` ? <Spinner /> : null}
                  {STATUS_INFO[next].label}
                </Button>
              ))}
            </div>
          </Field>
          ) : null}

          {/* Resolving without saying what was done leaves the citizen with a
              status change and no answer, so the note sits right here. */}
          {transitions.includes("resolved") ? (
            <Field>
              <FieldLabel htmlFor="resolution-note">Resolution note</FieldLabel>
              <Textarea
                className="min-h-20"
                id="resolution-note"
                onChange={(event) => setResolution(event.target.value)}
                placeholder="What was done to fix it? This is sent to the citizen."
                value={resolution}
              />
            </Field>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Routing</CardTitle>
          <CardDescription>
            {canReroute
              ? "Overriding the AI is recorded against its decision log."
              : "Priority is yours to set. Rerouting to another department is an admin action."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Only an admin reroutes. A department that could hand its own work
              to another department would be escalating without a record of
              having asked. */}
          {canReroute && departments.length > 0 ? (
            <Field>
              <FieldLabel>Department</FieldLabel>
              <Select
                disabled={pending !== null}
                items={departmentItems}
                onValueChange={(value) => {
                  if (!value) return
                  run(
                    "department",
                    () => overrideDepartmentAction(complaintId, value),
                    "Department updated.",
                  )
                }}
                value={departmentId ?? undefined}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unrouted" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <Field>
            <FieldLabel>Priority</FieldLabel>
            <Select
              disabled={pending !== null}
              items={priorityItems}
              onValueChange={(value) => {
                if (!value) return
                run(
                  "priority",
                  () => overridePriorityAction(complaintId, value),
                  "Priority updated.",
                )
              }}
              value={priorityId ?? undefined}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unset" />
              </SelectTrigger>
              <SelectContent>
                {priorities.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {canReroute && hasDuplicate ? (
            <Button
              className="w-full"
              disabled={pending !== null}
              onClick={() =>
                run(
                  "duplicate",
                  () => clearDuplicateAction(complaintId),
                  "Duplicate link removed.",
                )
              }
              size="sm"
              variant="outline"
            >
              {pending === "duplicate" ? <Spinner /> : null}
              Not a duplicate
            </Button>
          ) : null}

          {canRetriage ? (
            <Button
              className="w-full"
              disabled={pending !== null}
              onClick={() =>
                run(
                  "retriage",
                  () => retriageAction(complaintId),
                  "Re-ran the AI pipeline.",
                )
              }
              size="sm"
              variant="ghost"
            >
              {pending === "retriage" ? <Spinner /> : null}
              Re-run AI triage
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a remark</CardTitle>
          <CardDescription>
            Public remarks notify the citizen. Internal ones stay in the
            department.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <Textarea
            className="min-h-24"
            onChange={(event) => setNote(event.target.value)}
            placeholder="Site inspected, materials ordered..."
            value={note}
          />

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={internal}
              onCheckedChange={(checked) => setInternal(checked === true)}
            />
            Internal only
          </label>

          <Button
            className="w-full"
            disabled={pending !== null || !note.trim()}
            onClick={() =>
              run(
                "remark",
                async () => {
                  await addRemarkAction(complaintId, note, internal)
                  setNote("")
                },
                internal ? "Internal remark added." : "Update sent to the citizen.",
              )
            }
            size="sm"
          >
            {pending === "remark" ? <Spinner /> : null}
            Add remark
          </Button>
        </CardContent>
      </Card>
    </>
  )
}
