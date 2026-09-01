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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { updateSettingsAction } from "@/lib/grievance/actions"
import type { PlatformSettings } from "@/lib/grievance/settings"

/** A labelled switch row - the shape every toggle on this page shares. */
function Toggle({
  checked,
  description,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  description: string
  disabled?: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border p-3 ${
        disabled ? "opacity-50" : "cursor-pointer"
      }`}
    >
      <Checkbox
        checked={checked}
        className="mt-0.5"
        disabled={disabled}
        onCheckedChange={(next) => onChange(next === true)}
      />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  )
}

export function AiSettings({ settings }: { settings: PlatformSettings }) {
  const router = useRouter()

  const [draft, setDraft] = React.useState(settings)
  const [isSaving, setIsSaving] = React.useState(false)

  const set = <K extends keyof PlatformSettings>(
    key: K,
    value: PlatformSettings[K],
  ) => setDraft((current) => ({ ...current, [key]: value }))

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings)

  const save = async () => {
    if (isSaving) return

    setIsSaving(true)

    try {
      await updateSettingsAction(draft)
      toast.success("AI configuration saved.")
      router.refresh()
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not save that.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline</CardTitle>
        <CardDescription>
          Every new complaint runs through embed, classify, prioritise and
          duplicate detection. Each stage can be turned off independently.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Toggle
          checked={draft.aiEnabled}
          description="The master switch. With this off, every complaint waits for manual triage."
          label="AI triage enabled"
          onChange={(next) => set("aiEnabled", next)}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            checked={draft.autoClassify}
            disabled={!draft.aiEnabled}
            description="Route complaints to a department automatically."
            label="Classification"
            onChange={(next) => set("autoClassify", next)}
          />
          <Toggle
            checked={draft.autoPrioritize}
            disabled={!draft.aiEnabled}
            description="Assign a priority level from the configured scale."
            label="Prioritisation"
            onChange={(next) => set("autoPrioritize", next)}
          />
          <Toggle
            checked={draft.duplicateDetection}
            disabled={!draft.aiEnabled}
            description="Link new complaints to earlier reports of the same issue."
            label="Duplicate detection"
            onChange={(next) => set("duplicateDetection", next)}
          />
          <Toggle
            checked={draft.autoAssign}
            disabled={!draft.aiEnabled}
            description="Move a confidently routed complaint straight into the department's queue."
            label="Auto-assign"
            onChange={(next) => set("autoAssign", next)}
          />
        </div>

        <Separator />

        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="confidence-threshold">
                Confidence threshold
              </FieldLabel>
              <Input
                id="confidence-threshold"
                max={1}
                min={0}
                onChange={(event) =>
                  set("confidenceThreshold", Number(event.target.value))
                }
                step={0.05}
                type="number"
                value={draft.confidenceThreshold}
              />
              {/* Raising this trades coverage for accuracy: fewer complaints
                  get routed automatically, but the ones that do are righter. */}
              <FieldDescription>
                Below this, a classification is logged but not applied - the
                complaint waits for a human. Currently{" "}
                {Math.round(draft.confidenceThreshold * 100)}%.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="duplicate-threshold">
                Duplicate similarity
              </FieldLabel>
              <Input
                id="duplicate-threshold"
                max={1}
                min={0.5}
                onChange={(event) =>
                  set("duplicateThreshold", Number(event.target.value))
                }
                step={0.01}
                type="number"
                value={draft.duplicateThreshold}
              />
              <FieldDescription>
                Cosine similarity above which two complaints are the same issue.
                Lower catches more duplicates but risks burying real ones.
              </FieldDescription>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="platform-name">Platform name</FieldLabel>
            <Input
              id="platform-name"
              maxLength={60}
              onChange={(event) => set("platformName", event.target.value)}
              value={draft.platformName}
            />
          </Field>
        </FieldGroup>

        <div className="flex justify-end gap-2">
          <Button
            disabled={!isDirty || isSaving}
            onClick={() => setDraft(settings)}
            variant="ghost"
          >
            Reset
          </Button>
          <Button disabled={!isDirty || isSaving} onClick={save}>
            {isSaving ? <Spinner /> : null}
            Save configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
