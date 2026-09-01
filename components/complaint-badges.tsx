import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { STATUS_INFO, type ComplaintStatus } from "@/lib/grievance/status"

/**
 * One status, one colour, everywhere.
 *
 * Tones are spelled out per case rather than composed from a token string,
 * because Tailwind only ships the classes it can see written out in full.
 */
const TONE_CLASS: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground border-transparent",
  info: "bg-sky-500/12 text-sky-700 border-sky-500/25 dark:text-sky-300",
  active: "bg-amber-500/12 text-amber-700 border-amber-500/25 dark:text-amber-300",
  success:
    "bg-emerald-500/12 text-emerald-700 border-emerald-500/25 dark:text-emerald-300",
  danger: "bg-red-500/12 text-red-700 border-red-500/25 dark:text-red-300",
}

/**
 * Placeholder shown while the AI pass is still deciding.
 *
 * A pulsing skeleton the same size as the badge it replaces, so the row does
 * not reflow when the real value arrives - and labelled for screen readers,
 * which get no signal at all from an animation.
 */
export function TriagingBadge({
  label = "Triaging",
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <span
      aria-label={`${label} - the AI is still deciding`}
      className={cn(
        "inline-flex h-5.5 animate-pulse items-center gap-1.5 rounded-md border border-dashed border-muted-foreground/30 bg-muted/50 px-2 text-xs text-muted-foreground",
        className,
      )}
      role="status"
      title="The AI triage pass is still running. This updates on its own."
    >
      <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/50" />
      {label}
    </span>
  )
}

export function StatusBadge({
  status,
  className,
}: {
  status: ComplaintStatus
  className?: string
}) {
  const info = STATUS_INFO[status]

  return (
    <Badge
      variant="outline"
      className={cn("font-normal", TONE_CLASS[info.tone], className)}
      title={info.description}
    >
      {info.label}
    </Badge>
  )
}

/**
 * A priority badge tinted with the level's own colour.
 *
 * The colour is admin-configurable, so it arrives as a hex string and is
 * applied inline - there is no class name that could carry an arbitrary value.
 */
export function PriorityBadge({
  name,
  color,
  severity,
  className,
}: {
  name: string | null
  color: string | null
  severity: number | null
  className?: string
}) {
  if (!name) {
    return (
      <Badge variant="outline" className={cn("font-normal text-muted-foreground", className)}>
        Unset
      </Badge>
    )
  }

  const swatch = color ?? "#64748B"

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-normal", className)}
      style={{
        color: swatch,
        borderColor: `${swatch}40`,
        backgroundColor: `${swatch}14`,
      }}
      title={severity ? `Severity ${severity} of 5` : undefined}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ backgroundColor: swatch }}
      />
      {name}
    </Badge>
  )
}

/**
 * How confident the AI was, shown as a percentage.
 *
 * Low confidence is coloured, not hidden: the whole point of surfacing it is
 * that a staff member can distinguish a routing worth trusting from a guess.
 */
export function ConfidenceBadge({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  const pct = Math.round(value * 100)
  const tone =
    value >= 0.8 ? "success" : value >= 0.55 ? "info" : "danger"

  return (
    <Badge
      variant="outline"
      className={cn("font-normal tabular-nums", TONE_CLASS[tone], className)}
      title={
        value >= 0.55
          ? "The model was confident enough to act on this."
          : "Below the confidence threshold - left for manual review."
      }
    >
      {pct}%
    </Badge>
  )
}

/** Marks a complaint the pipeline folded into an earlier one. */
export function DuplicateBadge({ reference }: { reference: string }) {
  return (
    <Badge
      variant="outline"
      className="border-transparent bg-violet-500/12 font-normal text-violet-700 dark:text-violet-300"
      title={`Detected as the same underlying issue as ${reference}`}
    >
      Duplicate of {reference}
    </Badge>
  )
}
