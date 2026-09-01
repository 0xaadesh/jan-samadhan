"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai"
import { MessagesSquareIcon } from "lucide-react"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import {
  ComplaintDetailsForm,
  type ComplaintDetails,
} from "@/components/chat/complaint-details-form"
import { Spinner } from "@/components/ui/spinner"
import {
  submitComplaintAction,
  verifyComplaintImagesAction,
} from "@/lib/grievance/actions"
import type { ChatUIMessage } from "@/lib/grievance/chat-tools"

const SUGGESTIONS = [
  "Report a pothole on my street",
  "There is no water supply today",
  "Any update on my complaints?",
]

/**
 * The details the citizen confirmed in the form.
 *
 * Held outside the message list on purpose: the storage keys and coordinates
 * are evidence, not conversation, and routing them through the model would
 * both waste tokens and let a prompt rewrite which photo gets attached.
 */
type ConfirmedDetails = ComplaintDetails

/** The index of the first text part, so the joined text renders in its place. */
function firstTextIndex(message: ChatUIMessage) {
  return message.parts.findIndex((part) => part.type === "text")
}

/**
 * The body of one assistant message, as a single block of text.
 *
 * The model sometimes emits the same answer twice, as two text blocks with
 * different ids inside one step - confirmed by streaming from the provider
 * directly, so it is not a React or transport artefact. Concatenating them
 * would show the citizen the same sentence twice, so identical blocks are
 * collapsed. Genuinely different blocks - the model narrating either side of a
 * tool call - are still kept and joined.
 */
function messageText(message: ChatUIMessage) {
  const seen = new Set<string>()
  const blocks: string[] = []

  for (const part of message.parts) {
    if (part.type !== "text") continue

    const text = part.text.trim()

    if (!text || seen.has(text)) continue

    seen.add(text)
    blocks.push(text)
  }

  return blocks.join("\n\n")
}

/**
 * The citizen assistant: file a complaint and follow it, in conversation.
 *
 * Filing runs through the same server action the written form uses, so the
 * image check, the storage-key ownership check and the triage handoff are the
 * ones already in place rather than a parallel set that can drift from them.
 */
export function ComplaintChat() {
  const router = useRouter()

  const [input, setInput] = React.useState("")
  const [rejections, setRejections] = React.useState<Record<string, string>>({})
  const [filing, setFiling] = React.useState(false)
  /** The photo check running while the details form is still on screen. */
  const [checking, setChecking] = React.useState(false)

  const confirmed = React.useRef<ConfirmedDetails | null>(null)
  /** Tool calls already acted on, so a re-render cannot file twice. */
  const handled = React.useRef<Set<string>>(new Set())

  const { messages, sendMessage, addToolOutput, status } = useChat<ChatUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  })

  const busy = status === "submitted" || status === "streaming"

  /**
   * Run the filing when the model asks for it.
   *
   * `fileComplaint` has no `execute` on the server, so it arrives here as a
   * pending tool call. The details come from the form the citizen filled in,
   * not from the model's arguments - the model decides *when* to file, never
   * what gets filed. Each call id is acted on once.
   */
  React.useEffect(() => {
    const last = messages[messages.length - 1]

    if (!last || last.role !== "assistant") return

    for (const part of last.parts) {
      if (part.type !== "tool-fileComplaint") continue
      if (part.state !== "input-available") continue
      if (handled.current.has(part.toolCallId)) continue

      handled.current.add(part.toolCallId)

      const details = confirmed.current

      if (!details) {
        addToolOutput({
          tool: "fileComplaint",
          toolCallId: part.toolCallId,
          output: {
            filed: false,
            message:
              "No confirmed details yet - ask for them with collectComplaintDetails first.",
          },
        })
        continue
      }

      void file(part.toolCallId, details)
    }
    // `file` is stable enough for this - it only closes over setters and the
    // action imports, all of which are constant across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  /**
   * File the complaint the citizen already confirmed.
   *
   * The photos were checked in `confirmDetails`, while the form was still on
   * screen to show a rejection. `submitComplaintAction` checks them again
   * server-side and is the authority; if it refuses, that comes back as a
   * failed tool output the assistant can explain rather than a stuck spinner.
   */
  const file = async (toolCallId: string, details: ComplaintDetails) => {
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

      addToolOutput({
        tool: "fileComplaint",
        toolCallId,
        output: {
          filed: true,
          reference,
          message: `Complaint ${reference} was filed and is being routed now.`,
        },
      })

      // The dashboard and complaint list are server-rendered, so they need to
      // re-fetch before the new complaint shows up behind the sheet.
      router.refresh()
    } catch (cause) {
      console.error(cause)

      addToolOutput({
        tool: "fileComplaint",
        toolCallId,
        output: {
          filed: false,
          message:
            cause instanceof Error
              ? cause.message
              : "The complaint could not be filed just now.",
        },
      })
    } finally {
      setFiling(false)
    }
  }

  /**
   * Accept the details the citizen filled in - but only once the photos check
   * out against them.
   *
   * The check has to happen here, before the tool output is released. Handing
   * back the output moves the tool part to "output-available", which unmounts
   * the form; if a photo were then rejected there would be nothing left on
   * screen to attach the reason to, and the citizen would be left watching a
   * spinner with no way to fix it.
   */
  const confirmDetails = async (
    toolCallId: string,
    details: ComplaintDetails,
  ) => {
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
          // The form stays mounted with the reasons on the offending photos.
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

    // Held so `fileComplaint` can use the keys and coordinates, which never
    // go through the model.
    confirmed.current = details

    addToolOutput({
      tool: "collectComplaintDetails",
      toolCallId,
      output: {
        confirmed: true,
        title: details.title,
        description: details.description,
        locationText: details.locationText,
        photoCount: details.imageKeys.length,
      },
    })
  }

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text?.trim() || busy) return

    sendMessage({ text: message.text })
    setInput("")
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        The scroll area needs a definite height, not just flex-1.
        StickToBottom's inner scroller carries an inline `height: 100%`, which
        resolves against a flex item that is still sizing to its own content -
        so the whole column inflates and the composer is pushed off the bottom.
        Pinning the conversation inside a relatively positioned flex slot gives
        that 100% a real box to measure.
      */}
      <div className="relative min-h-0 flex-1">
        <Conversation className="absolute inset-0">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              description="Describe a problem in your area and I will file it, or ask about a complaint you have already reported."
              icon={<MessagesSquareIcon className="size-6" />}
              title="Report or track a complaint"
            />
          ) : null}

          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent>
                {message.parts.map((part, index) => {
                  const key = `${message.id}-${index}`

                  if (part.type === "text") {
                    // A model that narrates either side of a tool call emits
                    // several text parts in one message. Rendering each as its
                    // own bubble shows the citizen what looks like the
                    // assistant repeating itself, so only the first is drawn
                    // and it carries the whole message's text.
                    if (index !== firstTextIndex(message)) return null

                    return (
                      <MessageResponse key={key}>
                        {messageText(message)}
                      </MessageResponse>
                    )
                  }

                  // The step-input card: the assistant asking for the details
                  // it needs, rendered as a form rather than as four questions.
                  if (part.type === "tool-collectComplaintDetails") {
                    // Deliberately not rendered during "input-streaming": the
                    // drafted title and description are still arriving, and the
                    // form seeds its fields once on mount, so mounting early
                    // leaves the citizen looking at empty boxes that never
                    // fill in.
                    if (part.state === "input-streaming") {
                      return (
                        <p
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                          key={key}
                        >
                          <Spinner /> Preparing the form...
                        </p>
                      )
                    }

                    if (part.state === "input-available") {
                      const input = part.input as {
                        reason?: string
                        suggestedTitle?: string
                        suggestedDescription?: string
                      }

                      return (
                        <ComplaintDetailsForm
                          disabled={filing || checking}
                          key={key}
                          onCancel={() =>
                            addToolOutput({
                              tool: "collectComplaintDetails",
                              toolCallId: part.toolCallId,
                              output: {
                                confirmed: false,
                                message:
                                  "The citizen cancelled and did not provide details.",
                              },
                            })
                          }
                          onSubmit={(details) =>
                            confirmDetails(part.toolCallId, details)
                          }
                          reason={input?.reason ?? ""}
                          rejections={rejections}
                          suggestedDescription={
                            input?.suggestedDescription ?? ""
                          }
                          suggestedTitle={input?.suggestedTitle ?? ""}
                        />
                      )
                    }

                    return null
                  }

                  if (part.type === "tool-fileComplaint") {
                    if (part.state === "input-available") {
                      return (
                        <p
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                          key={key}
                        >
                          <Spinner /> Filing your complaint...
                        </p>
                      )
                    }

                    return null
                  }

                  return null
                })}
              </MessageContent>
            </Message>
          ))}

          {status === "submitted" ? (
            <Message from="assistant">
              <MessageContent>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner /> Thinking...
                </p>
              </MessageContent>
            </Message>
          ) : null}
        </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>

      <div className="shrink-0 space-y-2 border-t p-3">
        {messages.length === 0 ? (
          <Suggestions>
            {SUGGESTIONS.map((suggestion) => (
              <Suggestion
                key={suggestion}
                onClick={(value) => sendMessage({ text: value })}
                suggestion={suggestion}
              />
            ))}
          </Suggestions>
        ) : null}

        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              // Taller than the default min-h-16: a citizen describing a
              // problem writes a few sentences, not a search query, and the
              // sheet is narrow enough that those wrap onto several lines.
              className="min-h-28 max-h-64"
              onChange={(event) => setInput(event.target.value)}
              placeholder="Describe the problem, or ask about a complaint..."
              value={input}
            />
          </PromptInputBody>
          {/*
            The submit button belongs in a footer, not bare in the group.
            PromptInputFooter renders data-align="block-end", which is what
            switches InputGroup out of its fixed h-9 row into an auto-height
            column - without it the group stays 36px tall and clips the
            textarea no matter what height the textarea asks for.
          */}
          <PromptInputFooter>
            <div />
            <PromptInputSubmit
              disabled={!input.trim() && !busy}
              status={status}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
