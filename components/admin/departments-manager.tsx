"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PencilIcon, PlusIcon, Trash2Icon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  createDepartmentAction,
  deleteDepartmentAction,
  updateDepartmentAction,
} from "@/lib/grievance/actions"
import type { DepartmentRow } from "@/lib/grievance/admin"

/** The add/edit form. Mounted per row, so it seeds from whichever it edits. */
function DepartmentForm({
  department,
  onCancel,
  onDone,
}: {
  department?: DepartmentRow
  onCancel: () => void
  onDone: () => void
}) {
  const [name, setName] = React.useState(department?.name ?? "")
  const [description, setDescription] = React.useState(
    department?.description ?? "",
  )
  const [active, setActive] = React.useState(department?.active ?? true)
  const [isSaving, setIsSaving] = React.useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!name.trim() || !description.trim() || isSaving) return

    setIsSaving(true)

    try {
      if (department) {
        await updateDepartmentAction(department.id, name, description, active)
      } else {
        await createDepartmentAction(name, description)
      }
    } catch (cause) {
      setIsSaving(false)
      toast.error(
        cause instanceof Error ? cause.message : "Could not save that.",
      )
      return
    }

    setIsSaving(false)
    toast.success(department ? "Department updated." : "Department created.")
    onDone()
  }

  return (
    <form className="rounded-xl border p-3" onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="department-name">Name</FieldLabel>
          <Input
            autoFocus
            id="department-name"
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Water Supply"
            required
            value={name}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="department-description">
            What it handles
          </FieldLabel>
          <Textarea
            className="min-h-28"
            id="department-description"
            maxLength={1500}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Piped water supply and sewerage. Handles no water, low pressure, contaminated water, burst mains, leaking pipelines and overflowing sewers."
            required
            value={description}
          />
          {/* This is not documentation - the classifier reads it verbatim, so
              naming the concrete problems citizens report is what makes
              routing accurate. */}
          <FieldDescription>
            The AI classifier reads this to decide what belongs here. List the
            actual problems citizens report, not a mission statement.
          </FieldDescription>
        </Field>

        {department ? (
          <Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={active}
                onCheckedChange={(checked) => setActive(checked === true)}
              />
              Active
            </label>
            <FieldDescription>
              Inactive departments stop receiving new complaints but keep their
              history.
            </FieldDescription>
          </Field>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={isSaving} type="submit">
            {isSaving ? <Spinner /> : null}
            {department ? "Save changes" : "Create department"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}

export function DepartmentsManager({
  departments,
}: {
  departments: DepartmentRow[]
}) {
  const router = useRouter()

  const [isCreating, setIsCreating] = React.useState(false)
  const [editing, setEditing] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<DepartmentRow | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  const refresh = () => {
    setIsCreating(false)
    setEditing(null)
    router.refresh()
  }

  const confirmDelete = async () => {
    if (!deleting || isDeleting) return

    setIsDeleting(true)

    try {
      await deleteDepartmentAction(deleting.id)
      toast.success("Department deleted.")
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not delete that.",
      )
    }

    setIsDeleting(false)
    setDeleting(null)
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {departments.length} department{departments.length === 1 ? "" : "s"}
        </p>
        {!isCreating ? (
          <Button onClick={() => setIsCreating(true)} size="sm">
            <PlusIcon />
            New department
          </Button>
        ) : null}
      </div>

      {isCreating ? (
        <DepartmentForm
          onCancel={() => setIsCreating(false)}
          onDone={refresh}
        />
      ) : null}

      <div className="space-y-2">
        {departments.map((entry) =>
          editing === entry.id ? (
            <DepartmentForm
              department={entry}
              key={entry.id}
              onCancel={() => setEditing(null)}
              onDone={refresh}
            />
          ) : (
            <div className="rounded-xl border p-3" key={entry.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{entry.name}</p>
                    <Badge variant="outline" className="font-mono text-xs font-normal">
                      {entry.slug}
                    </Badge>
                    {!entry.active ? (
                      <Badge variant="secondary" className="font-normal">
                        Inactive
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {entry.description}
                  </p>
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <UsersIcon className="size-3" />
                      {entry.memberCount} member
                      {entry.memberCount === 1 ? "" : "s"}
                    </span>
                    <span>{entry.openCount} open complaints</span>
                  </div>
                </div>

                <div className="flex shrink-0 gap-1">
                  <Button
                    aria-label={`Edit ${entry.name}`}
                    onClick={() => setEditing(entry.id)}
                    size="icon"
                    variant="ghost"
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    aria-label={`Delete ${entry.name}`}
                    onClick={() => setDeleting(entry)}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            </div>
          ),
        )}
      </div>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.openCount
                ? `${deleting.openCount} open complaint(s) will become unrouted and need triaging again. `
                : ""}
              {deleting?.memberCount
                ? `${deleting.memberCount} member(s) will lose their department assignment. `
                : ""}
              Complaint history is kept. Deactivating instead keeps the
              department out of new routing without disturbing anything.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={confirmDelete}>
              {isDeleting ? <Spinner /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
