"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  CopyCheckIcon,
  ImagePlusIcon,
  Loader2Icon,
  MapPinIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  findSimilarComplaintsAction,
  presignComplaintImageAction,
  submitComplaintAction,
  verifyComplaintImagesAction,
} from "@/lib/grievance/actions"
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from "@/lib/grievance/limits"

const MAX_IMAGES = 5
const MAX_BYTES = 10 * 1024 * 1024

/** An open complaint the draft may be restating. */
type SimilarComplaint = {
  id: string
  reference: string
  title: string
  status: string
  createdAt: Date | string
  similarity: number
}

type Attachment = {
  /** Local id, so a list re-render does not lose track of a pending upload. */
  id: string
  file: File
  /** Object URL for the thumbnail, revoked on removal. */
  preview: string
  /** The storage key, once the upload finishes. */
  key?: string
  status: "uploading" | "done" | "failed"
  /**
   * Why the check rejected this photo, if it did. Cleared whenever the title
   * or description changes, since the verdict was about the old text.
   */
  rejection?: string
}

export function SubmitComplaintForm() {
  const router = useRouter()

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [locationText, setLocationText] = React.useState("")
  const [coords, setCoords] = React.useState<{
    latitude: number
    longitude: number
  } | null>(null)
  const [attachments, setAttachments] = React.useState<Attachment[]>([])
  const [isLocating, setIsLocating] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isVerifying, setIsVerifying] = React.useState(false)
  const [isCheckingDuplicates, setIsCheckingDuplicates] = React.useState(false)
  const [similar, setSimilar] = React.useState<SimilarComplaint[]>([])
  /**
   * Whether the citizen has already been shown the matches and submitted
   * again anyway. The warning is advisory, so it stops at one interruption -
   * asking twice would just train people to click through it.
   */
  const [duplicatesAcknowledged, setDuplicatesAcknowledged] =
    React.useState(false)

  const fileInput = React.useRef<HTMLInputElement>(null)

  // Object URLs leak until revoked, and a citizen may attach and remove
  // several photos before submitting.
  React.useEffect(() => {
    return () => {
      for (const item of attachments) URL.revokeObjectURL(item.preview)
    }
    // Intentionally on unmount only - per-item revocation happens in remove().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Upload straight to object storage with a presigned PUT.
   *
   * The bytes never touch the Next server, so a 10MB photo on a phone
   * connection does not occupy a server request for its whole duration.
   */
  const upload = async (item: Attachment) => {
    try {
      const { url, key } = await presignComplaintImageAction(
        item.file.name,
        item.file.type,
      )

      const response = await fetch(url, {
        method: "PUT",
        body: item.file,
        headers: { "Content-Type": item.file.type },
      })

      if (!response.ok) throw new Error(`Upload failed (${response.status})`)

      setAttachments((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, key, status: "done" } : entry,
        ),
      )
    } catch (cause) {
      console.error(cause)
      setAttachments((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, status: "failed" } : entry,
        ),
      )
      toast.error(`Could not upload ${item.file.name}.`)
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return

    const room = MAX_IMAGES - attachments.length

    if (room <= 0) {
      toast.error(`You can attach at most ${MAX_IMAGES} photos.`)
      return
    }

    const accepted: Attachment[] = []

    for (const file of Array.from(files).slice(0, room)) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image.`)
        continue
      }

      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is larger than 10MB.`)
        continue
      }

      accepted.push({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        status: "uploading",
      })
    }

    if (accepted.length === 0) return

    setAttachments((current) => [...current, ...accepted])

    // Uploads start immediately rather than on submit, so the wait overlaps
    // with the citizen still typing their description.
    for (const item of accepted) void upload(item)
  }

  const remove = (id: string) => {
    setAttachments((current) => {
      const target = current.find((entry) => entry.id === id)
      if (target) URL.revokeObjectURL(target.preview)
      return current.filter((entry) => entry.id !== id)
    })
  }

  const locate = () => {
    if (!navigator.geolocation) {
      toast.error("This browser cannot share your location.")
      return
    }

    setIsLocating(true)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
        setIsLocating(false)
        toast.success("Location attached.")
      },
      (error) => {
        setIsLocating(false)
        console.error("Geolocation error:", error.code, error.message)
        toast.error("Could not read your location. Describe it below instead.")
      },
      { enableHighAccuracy: true, timeout: 30000 },
    )
  }

  const uploading = attachments.some((entry) => entry.status === "uploading")

  const rejected = attachments.filter((entry) => entry.rejection)

  /**
   * Drop stale verdicts when the problem text changes.
   *
   * A photo is judged against the title and description, so once either is
   * edited the old rejection no longer describes anything real - and a citizen
   * whose fix was to correct their description would otherwise stay blocked by
   * a verdict about text they have already replaced.
   *
   * The duplicate matches are judged against the same text and go stale for
   * the same reason. The acknowledgement goes with them: a citizen who
   * rewrote their complaint to describe a different problem is making a new
   * claim, and deserves to have it checked rather than waved through on a
   * decision they made about the old wording.
   */
  const clearVerdicts = () => {
    setAttachments((current) =>
      current.some((entry) => entry.rejection)
        ? current.map((entry) => ({ ...entry, rejection: undefined }))
        : current,
    )
    setSimilar([])
    setDuplicatesAcknowledged(false)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (
      !title.trim() ||
      !description.trim() ||
      isSubmitting ||
      isVerifying ||
      isCheckingDuplicates
    ) {
      return
    }

    if (uploading) {
      toast.error("Wait for the photos to finish uploading.")
      return
    }

    const imageKeys = attachments
      .filter((entry) => entry.status === "done" && entry.key)
      .map((entry) => entry.key as string)

    // Nothing is created until the photos have been checked against the text.
    // A mismatch has to surface on the form, next to the photo that caused it,
    // rather than as a complaint the citizen then has to withdraw.
    if (imageKeys.length > 0) {
      setIsVerifying(true)

      try {
        const check = await verifyComplaintImagesAction({
          title,
          description,
          imageKeys,
        })

        if (!check.ok) {
          const reasons = new Map(
            check.rejected.map((entry) => [entry.key, entry.message]),
          )

          setAttachments((current) =>
            current.map((entry) => ({
              ...entry,
              rejection: entry.key ? reasons.get(entry.key) : undefined,
            })),
          )

          setIsVerifying(false)

          toast.error(
            check.rejected.length === 1
              ? "One photo does not match the problem you described."
              : `${check.rejected.length} photos do not match the problem you described.`,
            { description: "Replace or remove them, then submit again." },
          )

          return
        }

        clearVerdicts()
      } catch (cause) {
        console.error(cause)
        // The check itself failing must not block a real report.
      }

      setIsVerifying(false)
    }

    // Then check whether this restates something already open. Unlike the
    // photo check this is a warning rather than a gate: it interrupts once,
    // shows what matched, and a second submit files the complaint regardless.
    if (!duplicatesAcknowledged) {
      setIsCheckingDuplicates(true)

      try {
        const matches = await findSimilarComplaintsAction({ title, description })

        if (matches.length > 0) {
          setSimilar(matches)
          setDuplicatesAcknowledged(true)
          setIsCheckingDuplicates(false)

          toast.warning("You may have already reported this.", {
            description:
              matches.length === 1
                ? "Check the match below. Submit again if it is a different problem."
                : "Check the matches below. Submit again if it is a different problem.",
          })

          return
        }
      } catch (cause) {
        console.error(cause)
        // A check that cannot run must not stand between a citizen and a
        // genuine complaint - fall through and file it.
      }

      setIsCheckingDuplicates(false)
    }

    setIsSubmitting(true)

    try {
      const { id, reference } = await submitComplaintAction({
        title,
        description,
        locationText,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        imageKeys,
      })

      toast.success(`Complaint ${reference} submitted.`, {
        description: "It is being routed to the right department now.",
      })

      router.push(`/complaints/${id}`)
    } catch (cause) {
      setIsSubmitting(false)
      toast.error(
        cause instanceof Error ? cause.message : "Could not submit that.",
      )
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Report an issue</CardTitle>
          <CardDescription>
            Describe the problem in your own words. It is routed to the right
            department automatically, and you can track it from your dashboard.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="complaint-title">Title</FieldLabel>
              <Input
                autoFocus
                id="complaint-title"
                maxLength={TITLE_MAX_LENGTH}
                onChange={(event) => {
                  setTitle(event.target.value)
                  clearVerdicts()
                }}
                placeholder="Overflowing drain outside the market gate"
                required
                value={title}
              />
              <FieldDescription>
                One line naming the problem and where it is.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="complaint-description">
                What is happening?
              </FieldLabel>
              <Textarea
                className="min-h-32"
                id="complaint-description"
                maxLength={DESCRIPTION_MAX_LENGTH}
                onChange={(event) => {
                  setDescription(event.target.value)
                  clearVerdicts()
                }}
                placeholder="Include how long it has been going on, who is affected, and anything that makes it urgent - standing water, exposed wires, blocked access."
                required
                value={description}
              />
              <FieldDescription>
                The more specific you are, the more accurately it is routed and
                prioritised, and the better we can tell your report apart from
                ones already open. {description.length}/{DESCRIPTION_MAX_LENGTH}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="complaint-location">Location</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="complaint-location"
                  onChange={(event) => setLocationText(event.target.value)}
                  placeholder="Landmark, street or ward"
                  value={locationText}
                />
                <Button
                  disabled={isLocating}
                  onClick={locate}
                  type="button"
                  variant="outline"
                >
                  {isLocating ? <Spinner /> : <MapPinIcon />}
                  {coords ? "Update" : "Use my location"}
                </Button>
              </div>
              <FieldDescription>
                {coords
                  ? `Coordinates attached (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}) - used to spot recurring hotspots.`
                  : "Optional, but coordinates help crews find the spot and reveal clusters."}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Photos</FieldLabel>
              <input
                accept="image/jpeg,image/png,image/webp,image/heic"
                className="hidden"
                multiple
                onChange={(event) => {
                  handleFiles(event.target.files)
                  // Reset, so re-picking the same file fires change again.
                  event.target.value = ""
                }}
                ref={fileInput}
                type="file"
              />

              <div className="flex flex-wrap gap-2">
                {attachments.map((item) => (
                  <div
                    className={`relative size-24 overflow-hidden rounded-lg border ${
                      item.rejection
                        ? "border-destructive ring-2 ring-destructive/40"
                        : ""
                    }`}
                    key={item.id}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={item.file.name}
                      className="size-full object-cover"
                      src={item.preview}
                    />
                    {item.status === "uploading" ? (
                      <div className="absolute inset-0 grid place-items-center bg-background/70">
                        <Loader2Icon className="size-4 animate-spin" />
                      </div>
                    ) : null}
                    {item.status === "failed" ? (
                      <div className="absolute inset-0 grid place-items-center bg-destructive/15 text-xs font-medium text-destructive">
                        Failed
                      </div>
                    ) : null}
                    {item.rejection ? (
                      <div className="absolute inset-0 grid place-items-center bg-destructive/25">
                        <ShieldAlertIcon className="size-5 text-destructive" />
                      </div>
                    ) : null}
                    <button
                      aria-label={`Remove ${item.file.name}`}
                      className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-background/90 text-foreground shadow-sm"
                      onClick={() => remove(item.id)}
                      type="button"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </div>
                ))}

                {attachments.length < MAX_IMAGES ? (
                  <button
                    className="grid size-24 place-items-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                    onClick={() => fileInput.current?.click()}
                    type="button"
                  >
                    <ImagePlusIcon className="size-5" />
                  </button>
                ) : null}
              </div>

              {rejected.length > 0 ? (
                <div
                  className="rounded-lg border border-destructive/50 bg-destructive/10 p-3"
                  role="alert"
                >
                  <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <ShieldAlertIcon className="size-4 shrink-0" />
                    {rejected.length === 1
                      ? "This photo does not match your description"
                      : "These photos do not match your description"}
                  </p>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    {rejected.map((item) => (
                      <li key={item.id}>
                        <span className="font-medium text-foreground">
                          {item.file.name}
                        </span>{" "}
                        - {item.rejection}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Remove the photo, attach the right one, or edit your
                    description so it matches what you photographed.
                  </p>
                </div>
              ) : null}

              <FieldDescription>
                Up to {MAX_IMAGES} photos, 10MB each. A photo is often the
                fastest way to show the severity. Photos are checked against
                your description before the complaint is filed.
              </FieldDescription>
            </Field>

            {similar.length > 0 ? (
              <div
                className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3"
                role="status"
              >
                <p className="flex items-center gap-2 text-sm font-medium">
                  <CopyCheckIcon className="size-4 shrink-0" />
                  {similar.length === 1
                    ? "A similar complaint is already open"
                    : "Similar complaints are already open"}
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {similar.map((match) => (
                    <li key={match.id}>
                      <a
                        className="font-medium text-foreground underline underline-offset-4"
                        href={`/complaints/${match.id}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {match.reference}
                      </a>{" "}
                      - {match.title}{" "}
                      <span className="text-xs">
                        ({Math.round(match.similarity * 100)}% similar,{" "}
                        {new Date(match.createdAt).toLocaleDateString()})
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm text-muted-foreground">
                  If one of these is the problem you are reporting, follow it
                  instead - filing again does not make it move faster. If yours
                  is genuinely different, submit again to file it.
                </p>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                disabled={isSubmitting || isVerifying || isCheckingDuplicates}
                onClick={() => router.back()}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                disabled={
                  isSubmitting ||
                  isVerifying ||
                  isCheckingDuplicates ||
                  uploading ||
                  rejected.length > 0 ||
                  !title.trim() ||
                  !description.trim()
                }
                type="submit"
              >
                {isSubmitting || isVerifying || isCheckingDuplicates ? (
                  <Spinner />
                ) : null}
                {isVerifying
                  ? "Checking photos..."
                  : isCheckingDuplicates
                    ? "Checking for duplicates..."
                    : isSubmitting
                      ? "Submitting..."
                      : similar.length > 0
                        ? "Submit anyway"
                        : "Submit complaint"}
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>
    </form>
  )
}
