"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon } from "lucide-react"

import { Persona, type PersonaState } from "@/components/ai-elements/persona"
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import { Message, MessageContent } from "@/components/ai-elements/message"
import {
  ComplaintDetailsForm,
  type ComplaintDetails,
} from "@/components/chat/complaint-details-form"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  getComplaintStatusAction,
  listMyComplaintsAction,
  submitComplaintAction,
  verifyComplaintImagesAction,
} from "@/lib/grievance/actions"
import {
  useRealtimeSession,
  type PendingToolCall,
} from "@/hooks/use-realtime-session"

/** What the persona shows for each point in the session. */
const PERSONA_STATE: Record<string, PersonaState> = {
  idle: "asleep",
  connecting: "thinking",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
  error: "asleep",
}

const STATUS_LABEL: Record<string, string> = {
  idle: "Tap to start talking",
  connecting: "Connecting...",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Something went wrong",
}

/**
 * The citizen assistant, spoken rather than typed.
 *
 * The same two jobs as the written chat - file a complaint, follow one - over
 * a live voice connection. Filing still runs through `submitComplaintAction`,
 * so the image check, the storage-key ownership check and the triage handoff
 * are the ones already in place rather than a third set that can drift.
 *
 * What voice cannot do is collect a photo or a precise location, so the
 * assistant hands those to the same details form the written chat uses: the
 * model drafts the title and description from what it heard, the form arrives
 * pre-filled, and the citizen corrects it and attaches evidence by hand.
 */
export function VoiceAssistant() {
  const router = useRouter()

  const [rejections, setRejections] = React.useState<Record<string, string>>({})
  const [filing, setFiling] = React.useState(false)
  const [checking, setChecking] = React.useState(false)

  /**
   * The details form the model asked for, still waiting on the citizen.
   *
   * A tool call that renders UI cannot be answered inside the handler - the
   * answer is whatever the citizen eventually submits - so the call is parked
   * here and settled by `confirmDetails`.
   */
  const [detailsCall, setDetailsCall] = React.useState<{
    callId: string
    reason: string
    title: string
    description: string
    location: string
  } | null>(null)

  /**
   * The details the citizen confirmed.
   *
   * Held outside the conversation on purpose: the storage keys and coordinates
   * are evidence, not speech. Routing them through the model would let a
   * spoken instruction rewrite which photo gets attached, and there is no
   * reason for a voice channel to carry an S3 key at all.
   */
  const confirmed = React.useRef<ComplaintDetails | null>(null)

  /**
   * Answer a tool call from the model.
   *
   * Returning `null` parks the call: `collectComplaintDetails` is settled by
   * the form, not here. Everything else is a read the server scopes to this
   * citizen, so it can be answered immediately.
   */
  const handleToolCall = React.useCallback(
    async (call: PendingToolCall): Promise<unknown | null> => {
      switch (call.name) {
        case "collectComplaintDetails": {
          setRejections({})
          setDetailsCall({
            callId: call.callId,
            reason: (call.args.reason as string) ?? "",
            title: (call.args.suggestedTitle as string) ?? "",
            description: (call.args.suggestedDescription as string) ?? "",
            location: (call.args.suggestedLocation as string) ?? "",
          })

          // Parked - the citizen has to fill the form in first.
          return null
        }

        case "fileComplaint": {
          const details = confirmed.current

          if (!details) {
            return {
              filed: false,
              message:
                "No confirmed details yet - ask for them with collectComplaintDetails first.",
            }
          }

          setFiling(true)

          try {
            const { reference } = await submitComplaintAction({
              title: details.title,
              description: details.description,
              locationText: details.locationText,
              latitude: details.latitude,
              longitude: details.longitude,
              imageKeys: details.imageKeys,
            })

            // Filed once. A second `fileComplaint` in the same session must
            // not re-submit the same form and create a duplicate record.
            confirmed.current = null

            // The dashboard and complaint list are server-rendered, so they
            // need to re-fetch before the new complaint shows up behind this.
            router.refresh()

            return {
              filed: true,
              reference,
              message: `Complaint ${reference} was filed and is being routed now. Read the reference back to the citizen letter by letter.`,
            }
          } catch (cause) {
            console.error(cause)

            return {
              filed: false,
              message:
                cause instanceof Error
                  ? cause.message
                  : "The complaint could not be filed just now.",
            }
          } finally {
            setFiling(false)
          }
        }

        case "listMyComplaints": {
          const limit = Number(call.args.limit) || 5
          const rows = await listMyComplaintsAction(limit)

          if (rows.length === 0) {
            return { complaints: [], message: "You have not filed anything yet." }
          }

          return { complaints: rows }
        }

        case "getComplaintStatus":
          return await getComplaintStatusAction(
            normalizeReference((call.args.reference as string) ?? ""),
          )

        default:
          return { error: "Unknown tool." }
      }
    },
    [router],
  )

  const {
    status,
    error,
    muted,
    transcripts,
    connect,
    disconnect,
    toggleMute,
    respondToTool,
  } = useRealtimeSession({ onToolCall: handleToolCall })

  /**
   * Whether there is a call to hang up.
   *
   * "connecting" counts: the microphone is already open and a peer connection
   * is being negotiated, so the citizen needs a way out of it. Without that
   * they are stuck watching a spinner with a live mic and no cancel button.
   */
  const live = status !== "idle" && status !== "error"

  /**
   * Accept the details the citizen filled in - but only once the photos check
   * out against them.
   *
   * The check runs before the tool call is settled, while the form is still on
   * screen. Settling first would unmount the form, and a rejected photo would
   * have nothing left to attach its reason to - leaving the citizen listening
   * to an assistant that says it filed something it did not.
   */
  const confirmDetails = async (details: ComplaintDetails) => {
    if (!detailsCall) return

    setChecking(true)
    setRejections({})

    try {
      if (details.imageKeys.length > 0) {
        const check = await verifyComplaintImagesAction({
          title: details.title,
          description: details.description,
          imageKeys: details.imageKeys,
        })

        if (!check.ok) {
          setRejections(
            Object.fromEntries(
              check.rejected.map((entry) => [entry.key, entry.message]),
            ),
          )

          // The form stays mounted with the reasons on the offending photos,
          // and the model is told why it is still waiting rather than being
          // left in silence.
          respondToTool(detailsCall.callId, {
            confirmed: false,
            message:
              "A photo does not match the description. The citizen has been shown why on the form and can fix it. Tell them briefly and wait.",
          })

          return
        }
      }
    } catch (cause) {
      // A failing check must not block a real report - the server action runs
      // the same check again and is the authority either way.
      console.error(cause)
    } finally {
      setChecking(false)
    }

    // Held so `fileComplaint` can use the keys and coordinates, which never go
    // through the model.
    confirmed.current = details

    setDetailsCall(null)

    respondToTool(detailsCall.callId, {
      confirmed: true,
      title: details.title,
      description: details.description,
      locationText: details.locationText,
      photoCount: details.imageKeys.length,
    })
  }

  const cancelDetails = () => {
    if (!detailsCall) return

    setDetailsCall(null)

    respondToTool(detailsCall.callId, {
      confirmed: false,
      message: "The citizen closed the form without confirming.",
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The persona and what it is doing, pinned above the transcript. */}
      <div className="flex shrink-0 flex-col items-center gap-2 border-b py-6">
        <Persona
          className="size-28"
          state={PERSONA_STATE[status] ?? "asleep"}
          variant="obsidian"
        />

        <p className="text-sm font-medium" aria-live="polite">
          {STATUS_LABEL[status] ?? ""}
        </p>

        {error ? (
          <p className="px-6 text-center text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1">
        {/*
          Same layout constraint as the written chat: StickToBottom's inner
          scroller carries an inline height:100%, which needs a parent with a
          real box rather than a flex item still sizing to its own content.
        */}
        <Conversation className="absolute inset-0">
          <ConversationContent>
            {transcripts.length === 0 && !detailsCall ? (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                {live
                  ? "Go ahead - describe the problem, or ask about a complaint you have already reported."
                  : "Start a call and describe a problem in your area, or ask about one you have already reported."}
              </p>
            ) : null}

            {transcripts.map((entry) => (
              <Message from={entry.role} key={entry.id}>
                <MessageContent>
                  <p className="text-sm whitespace-pre-wrap">{entry.text}</p>
                </MessageContent>
              </Message>
            ))}

            {/*
              The details form, rendered inside the conversation exactly as the
              written chat renders it. This is the part voice cannot do: a
              photo and a precise location are not things a citizen can say.
            */}
            {detailsCall ? (
              <Message from="assistant">
                <MessageContent>
                  <ComplaintDetailsForm
                    disabled={filing || checking}
                    key={detailsCall.callId}
                    onCancel={cancelDetails}
                    onSubmit={confirmDetails}
                    reason={detailsCall.reason}
                    rejections={rejections}
                    suggestedDescription={detailsCall.description}
                    suggestedLocation={detailsCall.location}
                    suggestedTitle={detailsCall.title}
                  />
                </MessageContent>
              </Message>
            ) : null}

            {filing ? (
              <Message from="assistant">
                <MessageContent>
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner /> Filing your complaint...
                  </p>
                </MessageContent>
              </Message>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-2 border-t p-4">
        {live ? (
          <>
            <Button
              aria-pressed={muted}
              // Nothing to mute until the connection is up.
              disabled={status === "connecting"}
              onClick={toggleMute}
              size="icon"
              variant={muted ? "secondary" : "outline"}
            >
              {muted ? <MicOffIcon /> : <MicIcon />}
              <span className="sr-only">
                {muted ? "Unmute the microphone" : "Mute the microphone"}
              </span>
            </Button>

            <Button onClick={disconnect} variant="destructive">
              <PhoneOffIcon />
              {status === "connecting" ? "Cancel" : "End call"}
            </Button>
          </>
        ) : (
          <Button onClick={connect}>
            <PhoneIcon />
            {status === "error" ? "Try again" : "Start talking"}
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Put a spoken reference back together.
 *
 * Dictated references arrive as "G R V four F two A one nine", or with the
 * hyphen spoken, or with digits already transcribed as words. The lookup is an
 * exact match, so a reference the citizen said perfectly well would otherwise
 * miss on punctuation and spacing alone.
 */
function normalizeReference(spoken: string) {
  const words: Record<string, string> = {
    zero: "0",
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    dash: "-",
    hyphen: "-",
  }

  const expanded = spoken
    .toLowerCase()
    .split(/[\s,]+/)
    .map((word) => words[word] ?? word)
    .join("")

  const cleaned = expanded.replace(/[^a-z0-9]/g, "").toUpperCase()

  if (!cleaned) return spoken.trim()

  // References are minted as GRV-XXXXXX; the prefix is spoken as letters and
  // the hyphen usually is not spoken at all.
  return cleaned.startsWith("GRV") && !cleaned.includes("-")
    ? `GRV-${cleaned.slice(3)}`
    : cleaned
}
