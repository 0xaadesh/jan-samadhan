"use client"

import * as React from "react"

import type { RealtimeToolName } from "@/lib/grievance/realtime-tools"

/**
 * The languages the recogniser is told to expect.
 *
 * Ordered by how often this service is likely to hear them rather than by
 * speaker counts nationally. It is a bias, not a whitelist: a caller speaking
 * something not listed here is still transcribed, just with less help.
 *
 * Every code here must be one the transcription model accepts - it rejects the
 * whole request over a single unknown one, which silently costs you the turn
 * detection and delay settings sent alongside it. Bengali, Telugu, Gujarati,
 * Punjabi, Malayalam and Odia are deliberately absent: the model does not list
 * them, so naming them would break the call rather than help those callers,
 * who are still transcribed by fallback detection.
 */
const RECOGNISED_LANGUAGES = [
  "hi", // Hindi
  "en", // English
  "mr", // Marathi
  "ta", // Tamil
  "kn", // Kannada
  "ur", // Urdu
  "ne", // Nepali - close enough to Hindi to help rather than mislead
]

export type RealtimeStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error"

export type RealtimeTranscript = {
  id: string
  role: "user" | "assistant"
  text: string
  /** False while the words are still arriving. */
  done: boolean
}

/**
 * A tool call the model has made and that the browser has not answered yet.
 *
 * Held as state rather than handled inline because one of the tools renders a
 * form: the call has to survive on screen until the citizen submits it.
 */
export type PendingToolCall = {
  callId: string
  name: RealtimeToolName
  args: Record<string, unknown>
}

type Options = {
  /**
   * Answers a tool call.
   *
   * Returning a value settles the call immediately. Returning `null` leaves it
   * pending - the UI has taken it over and will call `respondToTool` later.
   */
  onToolCall: (call: PendingToolCall) => Promise<unknown | null>
}

/**
 * One WebRTC voice session with the OpenAI Realtime API.
 *
 * The browser talks to OpenAI directly - audio over the peer connection's
 * media tracks, events over its data channel - so speech never makes a detour
 * through our server and the latency stays conversational. Our server's only
 * role is minting the ephemeral secret, which is also where the instructions
 * and the tool list are pinned.
 */
export function useRealtimeSession({ onToolCall }: Options) {
  const [status, setStatus] = React.useState<RealtimeStatus>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [muted, setMuted] = React.useState(false)
  const [transcripts, setTranscripts] = React.useState<RealtimeTranscript[]>([])

  const connection = React.useRef<RTCPeerConnection | null>(null)
  const channel = React.useRef<RTCDataChannel | null>(null)
  const microphone = React.useRef<MediaStream | null>(null)
  const audio = React.useRef<HTMLAudioElement | null>(null)

  /** Latest handler, so the data-channel listener never closes over a stale one. */
  const handler = React.useRef(onToolCall)
  React.useEffect(() => {
    handler.current = onToolCall
  }, [onToolCall])

  const send = React.useCallback((event: Record<string, unknown>) => {
    const socket = channel.current

    if (socket?.readyState !== "open") return

    socket.send(JSON.stringify(event))
  }, [])

  /**
   * Hand a tool result back to the model and let it speak again.
   *
   * Exposed so a form rendered for `collectComplaintDetails` can settle its
   * own call whenever the citizen gets round to submitting it.
   *
   * The `response.create` is sent on the next tick rather than back to back
   * with the item. Sent immediately it can reach the server before the
   * function output has been appended to the conversation, and the model then
   * answers a turn it cannot see the result of - which sounds like it ignored
   * the tool, or talks over its own previous sentence.
   */
  const respondToTool = React.useCallback(
    (callId: string, output: unknown) => {
      send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(output),
        },
      })

      queueMicrotask(() => send({ type: "response.create" }))
    },
    [send],
  )

  const disconnect = React.useCallback(() => {
    channel.current?.close()
    channel.current = null

    connection.current?.close()
    connection.current = null

    // Without this the browser's recording indicator stays lit after the
    // citizen has hung up, which reads as the page still listening.
    for (const track of microphone.current?.getTracks() ?? []) track.stop()
    microphone.current = null

    // Cleared before removal so the element releases the remote stream rather
    // than holding a reference to a track that is already gone.
    if (audio.current) {
      audio.current.srcObject = null
      audio.current.remove()
    }
    audio.current = null

    setStatus("idle")
    setMuted(false)
  }, [])

  /**
   * Run whatever tools the model asked for in a finished response.
   *
   * A handler that returns `null` has taken the call over - a form is on
   * screen - so it is left pending and settled later by `respondToTool`.
   */
  const settleToolCalls = React.useCallback(
    async (output: Array<Record<string, unknown>>) => {
      for (const item of output) {
        if (item.type !== "function_call") continue

        const call: PendingToolCall = {
          callId: item.call_id as string,
          name: item.name as RealtimeToolName,
          args: safeParse(item.arguments as string),
        }

        try {
          const result = await handler.current(call)

          if (result !== null) respondToTool(call.callId, result)
        } catch (cause) {
          console.error(cause)
          respondToTool(call.callId, {
            error:
              cause instanceof Error
                ? cause.message
                : "That could not be completed.",
          })
        }
      }
    },
    [respondToTool],
  )

  /**
   * Fold one server event into UI state.
   *
   * Only the events the interface actually reflects are handled - the
   * transcripts, the speaking/listening state and the tool calls. The realtime
   * API emits a great many more, and reacting to all of them would put the
   * persona into a state the citizen cannot interpret.
   */
  const handleServerEvent = React.useCallback(
    (event: Record<string, unknown>) => {
      const type = event.type as string

      switch (type) {
        /* The citizen's own words, streamed back as they are recognised. */
        case "conversation.item.input_audio_transcription.delta": {
          const id = event.item_id as string
          const delta = (event.delta as string) ?? ""

          setTranscripts((current) => appendDelta(current, id, "user", delta))
          break
        }

        case "conversation.item.input_audio_transcription.completed": {
          const id = event.item_id as string
          const text = (event.transcript as string) ?? ""

          setTranscripts((current) => settle(current, id, "user", text))
          break
        }

        /* The assistant's own words. */
        case "response.output_audio_transcript.delta": {
          const id = event.item_id as string
          const delta = (event.delta as string) ?? ""

          setTranscripts((current) =>
            appendDelta(current, id, "assistant", delta),
          )
          break
        }

        case "response.output_audio_transcript.done": {
          const id = event.item_id as string
          const text = (event.transcript as string) ?? ""

          setTranscripts((current) => settle(current, id, "assistant", text))
          break
        }

        /* Barge-in: the citizen talking over the assistant cuts it off. */
        case "input_audio_buffer.speech_started":
          setStatus("listening")
          break

        case "input_audio_buffer.speech_stopped":
          setStatus("thinking")
          break

        case "response.created":
          setStatus("thinking")
          break

        case "response.output_audio.delta":
          setStatus("speaking")
          break

        /*
         * A tool call, the moment its arguments are complete.
         *
         * Deliberately not waited for on `response.done`: that does not fire
         * until the model has finished saying its whole turn out loud, so the
         * details form would appear seconds after the assistant announced it
         * - the citizen hears "the form is on your screen" and stares at an
         * empty panel.
         */
        case "response.function_call_arguments.done": {
          void settleToolCalls([
            {
              type: "function_call",
              call_id: event.call_id,
              name: event.name,
              arguments: event.arguments,
            },
          ])
          break
        }

        case "response.done": {
          setStatus("listening")
          break
        }

        case "error": {
          const detail = event.error as { message?: string } | undefined
          console.error("Realtime error:", detail)
          setError(detail?.message ?? "The voice session hit an error.")
          break
        }

        default:
          break
      }
    },
    [settleToolCalls],
  )

  /** Held in a ref so the data-channel listener always sees the latest one. */
  const onServerEvent = React.useRef(handleServerEvent)
  React.useEffect(() => {
    onServerEvent.current = handleServerEvent
  }, [handleServerEvent])

  const connect = React.useCallback(async () => {
    setError(null)
    setStatus("connecting")
    setTranscripts([])

    try {
      // Started together: minting the secret is a round trip through our
      // server to OpenAI, and opening the microphone can sit behind a
      // permission prompt. Run one after the other they add up before the
      // call has even begun.
      const tokenPromise = fetch("/api/realtime/session", { method: "POST" })

      const streamPromise = navigator.mediaDevices.getUserMedia({
        // Browser DSP, on by default but spelled out because it is load
        // bearing here: without echo cancellation the model hears its own
        // voice through the speakers, treats it as the citizen interrupting,
        // and cuts itself off mid-sentence. That reads as "the response keeps
        // breaking up" rather than as feedback.
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      const [tokenResponse, stream] = await Promise.all([
        tokenPromise,
        streamPromise,
      ])

      if (!tokenResponse.ok) {
        // The microphone opened while the token was in flight, so it has to
        // be handed back - otherwise a failed connect leaves the recording
        // indicator lit.
        for (const track of stream.getTracks()) track.stop()

        throw new Error(
          (await tokenResponse.text()) || "Could not start a voice session.",
        )
      }

      const { clientSecret, model } = (await tokenResponse.json()) as {
        clientSecret: string
        model: string
      }

      microphone.current = stream

      const peer = new RTCPeerConnection()
      connection.current = peer

      // The model's voice.
      //
      // This has to be in the document. A detached media element is throttled
      // or stalled outright by Chrome's media pipeline, which arrives as
      // stuttering, late and half-missing speech - the audio is being
      // delivered on time and simply not played.
      const element = document.createElement("audio")
      element.autoplay = true
      // Nothing to see - it is the audio sink, not a player.
      element.style.display = "none"
      document.body.appendChild(element)
      audio.current = element

      peer.ontrack = (event) => {
        element.srcObject = event.streams[0]
        // Autoplay can still be refused; without this the call connects and
        // stays silent with no indication why.
        void element.play().catch((cause) => {
          console.error(cause)
          setError("Allow audio playback for this site to hear the assistant.")
        })
      }

      // Declared before the offer so the SDP carries a sendrecv audio section
      // from the start. Adding the track alone can negotiate send-only, and
      // then the model's voice never arrives.
      for (const track of stream.getTracks()) peer.addTrack(track, stream)

      const socket = peer.createDataChannel("oai-events")
      channel.current = socket

      socket.addEventListener("message", (event) => {
        onServerEvent.current(JSON.parse(event.data as string))
      })

      socket.addEventListener("open", () => {
        // Turn detection and transcription are set here rather than at token
        // time because they are the two things that decide how the call
        // *feels*, and both defaults are wrong for this use.
        //
        // - server_vad ends a turn on a short silence. Semantic VAD waits to
        //   judge whether the sentence is finished, which is the right call
        //   for a citizen who pauses to think but adds most of a second
        //   before the model will answer at all. "high" eagerness chunks as
        //   soon as it reasonably can, which is what makes it feel live.
        // - Input transcription is off unless asked for. Without it the
        //   citizen's own words never appear, so the transcript looks frozen
        //   until the assistant replies - the interface reading as slow even
        //   when the audio is not.
        send({
          type: "session.update",
          session: {
            // Required even on an update that only touches audio - the
            // session object is discriminated on it, and omitting it is
            // rejected with "Missing required parameter: 'session.type'".
            type: "realtime",
            audio: {
              input: {
                transcription: {
                  model: "gpt-live-transcribe",
                  delay: "low",
                  // A hint, not a restriction - it biases recognition toward
                  // the languages this service actually gets called in.
                  // Hindi and English lead because most callers use one, the
                  // other, or both in the same sentence, and a recogniser
                  // expecting only English turns Hindi into nonsense that the
                  // model then answers in English.
                  languages: RECOGNISED_LANGUAGES,
                },
                turn_detection: {
                  type: "semantic_vad",
                  eagerness: "high",
                  create_response: true,
                  // Barge-in: talking over the assistant stops it dead.
                  interrupt_response: true,
                },
              },
            },
          },
        })

        setStatus("listening")
      })

      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)

      const answer = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`,
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${clientSecret}`,
            "Content-Type": "application/sdp",
          },
        },
      )

      if (!answer.ok) throw new Error("The voice service refused the call.")

      await peer.setRemoteDescription({
        type: "answer",
        sdp: await answer.text(),
      })
    } catch (cause) {
      console.error(cause)
      disconnect()
      setStatus("error")
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not start a voice session.",
      )
    }
  }, [disconnect, send])

  /**
   * Mute the microphone without dropping the call.
   *
   * The track is disabled rather than stopped: stopping it would end the
   * session's audio input for good, and re-acquiring it would need a fresh
   * permission prompt and a renegotiation.
   */
  const toggleMute = React.useCallback(() => {
    const tracks = microphone.current?.getAudioTracks() ?? []

    setMuted((current) => {
      const next = !current
      for (const track of tracks) track.enabled = !next
      return next
    })
  }, [])

  /** Hanging up on unmount - a live microphone must not outlive the UI. */
  React.useEffect(() => disconnect, [disconnect])

  return {
    status,
    error,
    muted,
    transcripts,
    connect,
    disconnect,
    toggleMute,
    respondToTool,
  }
}

function safeParse(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value || "{}") as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Append a streamed fragment to the matching line, or start a new one. */
function appendDelta(
  current: RealtimeTranscript[],
  id: string,
  role: "user" | "assistant",
  delta: string,
): RealtimeTranscript[] {
  const existing = current.find((entry) => entry.id === id)

  if (!existing) return [...current, { id, role, text: delta, done: false }]

  return current.map((entry) =>
    entry.id === id ? { ...entry, text: entry.text + delta } : entry,
  )
}

/**
 * Replace a line with its final transcript.
 *
 * The completed event carries the whole utterance, which is authoritative:
 * recognition revises earlier words as later ones arrive, so the accumulated
 * deltas are a preview, not the record.
 */
function settle(
  current: RealtimeTranscript[],
  id: string,
  role: "user" | "assistant",
  text: string,
): RealtimeTranscript[] {
  const existing = current.find((entry) => entry.id === id)

  if (!existing) return [...current, { id, role, text, done: true }]

  return current.map((entry) =>
    entry.id === id
      ? { ...entry, text: text || entry.text, done: true }
      : entry,
  )
}
