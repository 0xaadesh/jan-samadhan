"use client"

import * as React from "react"
import { CopyCheckIcon, ImagePlusIcon, Loader2Icon, MapPinIcon, ShieldAlertIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  findSimilarComplaintsAction,
  presignComplaintImageAction,
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

export type ComplaintDetails = {
  title: string
  description: string
  locationText: string
  latitude: number | null
  longitude: number | null
  imageKeys: string[]
}

type Attachment = {
  id: string
  file: File
  preview: string
  key?: string
  status: "uploading" | "done" | "failed"
  /** Rejection message if image verification failed. */
  rejection?: string
}

/**
 * The step-input card the assistant renders when it needs the details.
 *
 * The conversation collects what the problem *is*; this collects the fields
 * the record actually needs. Asking for a title, a description, a location and
 * a photo as four chat turns would be four round trips through a language
 * model to fill in a form the citizen can see all at once.
 *
 * Photos upload as soon as they are picked, so the wait overlaps with the
 * citizen still reading the draft text.
 */
export function ComplaintDetailsForm({
  reason,
  suggestedTitle,
  suggestedDescription,
  suggestedLocation = "",
  rejections,
  disabled,
  onSubmit,
  onCancel,
}: {
  reason: string
  suggestedTitle: string
  suggestedDescription: string
  /**
   * The location as the citizen gave it, when something upstream already
   * heard it - the voice assistant collects it by ear before the form opens.
   */
  suggestedLocation?: string
  /** Verification failures from the last attempt, keyed by storage key. */
  rejections?: Record<string, string>
  disabled?: boolean
  onSubmit: (details: ComplaintDetails) => void
  onCancel: () => void
}) {
  const [title, setTitle] = React.useState(suggestedTitle)
  const [description, setDescription] = React.useState(suggestedDescription)
  const [locationText, setLocationText] = React.useState(suggestedLocation)
  const [coords, setCoords] = React.useState<{
    latitude: number
    longitude: number
  } | null>(null)
  const [attachments, setAttachments] = React.useState<Attachment[]>([])
  const [isLocating, setIsLocating] = React.useState(false)
  const [similar, setSimilar] = React.useState<SimilarComplaint[]>([])
  const [isCheckingDuplicates, setIsCheckingDuplicates] = React.useState(false)
  const [isVerifying, setIsVerifying] = React.useState(false)
  /**
   * Whether the citizen has already been shown the matches and submitted
   * again anyway. The warning is advisory, so it stops at one interruption.
   */
  const [duplicatesAcknowledged, setDuplicatesAcknowledged] =
    React.useState(false)

  const fileInput = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    return () => {
      for (const item of attachments) URL.revokeObjectURL(item.preview)
    }
    // Unmount only - per-item revocation happens in remove().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const rejectionFor = (item: Attachment) => item.rejection

  /**
   * Drop stale verdicts when the problem text changes.
   *
   * A photo is judged against the title and description, so once either is
   * edited the old rejection no longer describes anything real.
   *
   * The duplicate matches are judged against the same text and go stale for
   * the same reason. The acknowledgement goes with them.
   */
  const clearVerdicts = () => {
    setAttachments((current) =>
      current.map((entry) => ({
        ...entry,
        rejection: undefined,
      })),
    )
    setSimilar([])
    setDuplicatesAcknowledged(false)
  }

  const submit = async () => {
    if (!title.trim() || !description.trim() || uploading || disabled || isVerifying || isCheckingDuplicates) return

    const imageKeys = attachments
      .filter((entry) => entry.status === "done" && entry.key)
      .map((entry) => entry.key as string)

    // Check for similar complaints first, unless already acknowledged.
    if (!duplicatesAcknowledged) {
      setIsCheckingDuplicates(true)

      try {
        const matches = await findSimilarComplaintsAction({
          title,
          description,
        })

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
        // genuine complaint - fall through and check images.
      }

      setIsCheckingDuplicates(false)
    }

    // Then check images.
    if (imageKeys.length > 0) {
      setIsVerifying(true)

      try {
        const check = await verifyComplaintImagesAction({
          title,
          description,
          imageKeys,
        })

        if (!check.ok) {
          // Store the rejection reasons so parent component can show them
          // This will be passed back through onSubmit if needed, or handled here
          const rejectionMap: Record<string, string> = {}
          for (const rejection of check.rejected) {
            rejectionMap[rejection.key] = rejection.message
          }
          
          setAttachments((current) =>
            current.map((entry) => ({
              ...entry,
              rejection: entry.key ? rejectionMap[entry.key] : undefined,
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
      } catch (cause) {
        console.error(cause)
        // The check itself failing must not block a real report.
      }

      setIsVerifying(false)
    }

    // All checks passed, submit the complaint
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      locationText: locationText.trim(),
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      imageKeys,
    })
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border bg-card p-3">
      {reason ? (
        <p className="text-sm text-muted-foreground">{reason}</p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="chat-title">Title</Label>
        <Input
          disabled={disabled}
          id="chat-title"
          maxLength={TITLE_MAX_LENGTH}
          onChange={(event) => {
            setTitle(event.target.value)
            clearVerdicts()
          }}
          placeholder="Overflowing drain outside the market gate"
          value={title}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="chat-description">What is happening?</Label>
        <Textarea
          className="min-h-24"
          disabled={disabled}
          id="chat-description"
          maxLength={DESCRIPTION_MAX_LENGTH}
          onChange={(event) => {
            setDescription(event.target.value)
            clearVerdicts()
          }}
          placeholder="How long it has been going on, who is affected, anything that makes it urgent."
          value={description}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="chat-location">Location</Label>
        <div className="flex gap-2">
          <Input
            disabled={disabled}
            id="chat-location"
            onChange={(event) => setLocationText(event.target.value)}
            placeholder="Landmark, street or ward"
            value={locationText}
          />
          <Button
            disabled={isLocating || disabled}
            onClick={locate}
            size="icon"
            type="button"
            variant="outline"
          >
            {isLocating ? <Spinner /> : <MapPinIcon />}
          </Button>
        </div>
        {coords ? (
          <p className="text-xs text-muted-foreground">
            Coordinates attached ({coords.latitude.toFixed(5)},{" "}
            {coords.longitude.toFixed(5)}).
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label>Photos</Label>
        <input
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          multiple
          onChange={(event) => {
            handleFiles(event.target.files)
            event.target.value = ""
          }}
          ref={fileInput}
          type="file"
        />

        <div className="flex flex-wrap gap-2">
          {attachments.map((item) => {
            const rejection = rejectionFor(item)

            return (
              <div
                className={`relative size-16 overflow-hidden rounded-lg border ${
                  rejection ? "border-destructive ring-2 ring-destructive/40" : ""
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
                  <div className="absolute inset-0 grid place-items-center bg-destructive/15 text-[10px] font-medium text-destructive">
                    Failed
                  </div>
                ) : null}
                {rejection ? (
                  <div className="absolute inset-0 grid place-items-center bg-destructive/25">
                    <ShieldAlertIcon className="size-4 text-destructive" />
                  </div>
                ) : null}
                <button
                  aria-label={`Remove ${item.file.name}`}
                  className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-background/90 text-foreground shadow-sm"
                  onClick={() => remove(item.id)}
                  type="button"
                >
                  <XIcon className="size-2.5" />
                </button>
              </div>
            )
          })}

          {attachments.length < MAX_IMAGES ? (
            <button
              className="grid size-16 place-items-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
              disabled={disabled}
              onClick={() => fileInput.current?.click()}
              type="button"
            >
              <ImagePlusIcon className="size-4" />
            </button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Optional. Photos are checked against your description before filing.
        </p>
      </div>

      {rejections && Object.keys(rejections).length > 0 ? (
        <div
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-2.5"
          role="alert"
        >
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <ShieldAlertIcon className="size-3.5 shrink-0" />
            Photo does not match your description
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            {Object.values(rejections).map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {attachments.some((item) => item.rejection) ? (
        <div
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-2.5"
          role="alert"
        >
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <ShieldAlertIcon className="size-3.5 shrink-0" />
            Photo does not match your description
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            {attachments
              .filter((item) => item.rejection)
              .map((item) => (
                <li key={item.id}>{item.rejection}</li>
              ))}
          </ul>
        </div>
      ) : null}

      {similar.length > 0 ? (
        <div
          className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-2.5"
          role="status"
        >
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <CopyCheckIcon className="size-3.5 shrink-0" />
            {similar.length === 1
              ? "A similar complaint is already open"
              : "Similar complaints are already open"}
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            {similar.map((match) => (
              <li key={match.id}>
                <span className="font-medium text-foreground">
                  {match.reference}
                </span>{" "}
                - {match.title}{" "}
                <span className="text-xs">
                  ({Math.round(match.similarity * 100)}% similar,{" "}
                  {new Date(match.createdAt).toLocaleDateString()})
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted-foreground">
            If one of these is the problem, report on that one instead. If
            yours is different, submit again to file it.
          </p>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          disabled={disabled}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button
          disabled={
            disabled ||
            uploading ||
            !title.trim() ||
            !description.trim() ||
            isCheckingDuplicates ||
            isVerifying
          }
          onClick={submit}
          size="sm"
          type="button"
        >
          {disabled || isCheckingDuplicates || isVerifying ? <Spinner /> : null}
          {isCheckingDuplicates
            ? "Checking for duplicates..."
            : isVerifying
              ? "Checking photos..."
              : uploading
                ? "Uploading photo..."
                : "File this complaint"}
        </Button>
      </div>
    </div>
  )
}
