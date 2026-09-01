"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ClockIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
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
  createPriorityAction,
  deletePriorityAction,
  updatePriorityAction,
} from "@/lib/grievance/actions"
import type { PriorityRow } from "@/lib/grievance/admin"
import { SEVERITY_LABELS } from "@/lib/grievance/status"

/**
 * Severity labels for the Select trigger. Base UI renders the raw value there
 * unless Root is handed an `items` map, which would show "4" instead of
 * "4 - High".
 */
const severityItems: Record<string, string> = Object.fromEntries(
  [5, 4, 3, 2, 1].map((level) => [
    String(level),
    `${level} - ${SEVERITY_LABELS[level]}`,
  ]),
)

/** A small fixed palette - arbitrary hex would let levels become unreadable. */
const SWATCHES = [
  "#DC2626",
  "#EA580C",
  "#CA8A04",
  "#16A34A",
  "#0891B2",
  "#2563EB",
  "#7C3AED",
  "#64748B",
]

function PriorityForm({
  priority,
  onCancel,
  onDone,
}: {
  priority?: PriorityRow
  onCancel: () => void
  onDone: () => void
}) {
  const [name, setName] = React.useState(priority?.name ?? "")
  const [description, setDescription] = React.useState(
    priority?.description ?? "",
  )
  const [severity, setSeverity] = React.useState(priority?.severity ?? 3)
  const [slaHours, setSlaHours] = React.useState(
    priority?.slaHours?.toString() ?? "",
  )
  const [color, setColor] = React.useState(priority?.color ?? SWATCHES[7])
  const [active, setActive] = React.useState(priority?.active ?? true)
  const [isSaving, setIsSaving] = React.useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!name.trim() || isSaving) return

    setIsSaving(true)

    // An empty SLA means "no target", which is different from zero hours.
    const sla = slaHours.trim() ? Number(slaHours) : null

    try {
      if (priority) {
        await updatePriorityAction(priority.id, {
          name,
          description,
          severity,
          slaHours: sla,
          color,
          active,
        })
      } else {
        await createPriorityAction({
          name,
          description,
          severity,
          slaHours: sla,
          color,
        })
      }
    } catch (cause) {
      setIsSaving(false)
      toast.error(
        cause instanceof Error ? cause.message : "Could not save that.",
      )
      return
    }

    setIsSaving(false)
    toast.success(priority ? "Priority updated." : "Priority created.")
    onDone()
  }

  return (
    <form className="rounded-xl border p-3" onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="priority-name">Name</FieldLabel>
          <Input
            autoFocus
            id="priority-name"
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            placeholder="Critical"
            required
            value={name}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="priority-description">
            When it applies
          </FieldLabel>
          <Textarea
            className="min-h-24"
            id="priority-description"
            maxLength={800}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Immediate danger to life or health, or a failure affecting an entire locality."
            value={description}
          />
          <FieldDescription>
            The AI reads this when ranking a complaint, so describe the
            threshold rather than the feeling.
          </FieldDescription>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Severity</FieldLabel>
            <Select
              items={severityItems}
              onValueChange={(value) => {
                if (value) setSeverity(Number(value))
              }}
              value={String(severity)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 4, 3, 2, 1].map((level) => (
                  <SelectItem key={level} value={String(level)}>
                    {level} - {SEVERITY_LABELS[level]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Everything sorts and escalates by this, not by the name.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="priority-sla">Target (hours)</FieldLabel>
            <Input
              id="priority-sla"
              min={1}
              onChange={(event) => setSlaHours(event.target.value)}
              placeholder="24"
              type="number"
              value={slaHours}
            />
            <FieldDescription>
              Leave blank for no resolution target.
            </FieldDescription>
          </Field>
        </div>

        <Field>
          <FieldLabel>Colour</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((swatch) => (
              <button
                aria-label={`Use ${swatch}`}
                aria-pressed={color === swatch}
                className="size-7 rounded-full border-2 transition-transform hover:scale-110"
                key={swatch}
                onClick={() => setColor(swatch)}
                style={{
                  backgroundColor: swatch,
                  borderColor: color === swatch ? "currentColor" : "transparent",
                }}
                type="button"
              />
            ))}
          </div>
        </Field>

        {priority ? (
          <Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={active}
                onCheckedChange={(checked) => setActive(checked === true)}
              />
              Active
            </label>
          </Field>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={isSaving} type="submit">
            {isSaving ? <Spinner /> : null}
            {priority ? "Save changes" : "Create priority"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}

export function PrioritiesManager({
  priorities,
}: {
  priorities: PriorityRow[]
}) {
  const router = useRouter()

  const [isCreating, setIsCreating] = React.useState(false)
  const [editing, setEditing] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<PriorityRow | null>(null)
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
      await deletePriorityAction(deleting.id)
      toast.success("Priority deleted.")
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
          {priorities.length} level{priorities.length === 1 ? "" : "s"}, highest
          severity first
        </p>
        {!isCreating ? (
          <Button onClick={() => setIsCreating(true)} size="sm">
            <PlusIcon />
            New priority
          </Button>
        ) : null}
      </div>

      {isCreating ? (
        <PriorityForm onCancel={() => setIsCreating(false)} onDone={refresh} />
      ) : null}

      <div className="space-y-2">
        {priorities.map((entry) =>
          editing === entry.id ? (
            <PriorityForm
              key={entry.id}
              onCancel={() => setEditing(null)}
              onDone={refresh}
              priority={entry}
            />
          ) : (
            <div className="rounded-xl border p-3" key={entry.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <p className="font-medium">{entry.name}</p>
                    <Badge variant="outline" className="font-normal">
                      Severity {entry.severity}
                    </Badge>
                    {!entry.active ? (
                      <Badge variant="secondary" className="font-normal">
                        Inactive
                      </Badge>
                    ) : null}
                  </div>

                  {entry.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {entry.description}
                    </p>
                  ) : null}

                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <ClockIcon className="size-3" />
                      {entry.slaHours ? `${entry.slaHours}h target` : "No target"}
                    </span>
                    <span>{entry.complaintCount} complaints</span>
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
              {deleting?.complaintCount
                ? `${deleting.complaintCount} complaint(s) will be left with no priority until they are re-triaged. `
                : ""}
              Deactivating instead keeps it off new complaints while preserving
              the ones already ranked with it.
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
