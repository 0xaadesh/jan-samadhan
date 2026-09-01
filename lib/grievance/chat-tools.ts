import { tool, type InferUITools, type UIDataTypes, type UIMessage } from "ai"
import { z } from "zod"

/**
 * The tools the browser fulfils rather than the server.
 *
 * Shared between the route that declares them and the chat component that
 * answers them, so the tool names and argument shapes are checked against one
 * definition instead of being repeated as string literals on both sides.
 *
 * Neither has an `execute`: they arrive in the browser as pending tool calls,
 * which is what lets the citizen fill in a form or a photo the model never
 * sees the raw values of.
 */
export const clientTools = {
  /**
   * Collect the complaint details as a form rather than as prose.
   *
   * Client-side, with no execute: the model proposes what it still needs
   * and the browser renders it as inputs, so a citizen fills in one short
   * form instead of answering four questions in a row.
   */
  collectComplaintDetails: tool({
    description:
      "Ask the citizen for the details needed to file a complaint. Use this once you roughly understand the problem, to collect the title, description, location and photo together.",
    inputSchema: z.object({
      reason: z
        .string()
        .describe(
          "One short line telling the citizen why you need these details.",
        ),
      suggestedTitle: z
        .string()
        .describe(
          "A one-line title drafted from what they have said so far. Empty string if you have nothing to go on.",
        ),
      suggestedDescription: z
        .string()
        .describe(
          "A fuller description drafted from what they have said so far. Empty string if you have nothing to go on.",
        ),
    }),
    outputSchema: z.object({
      confirmed: z.boolean(),
      title: z.string().optional(),
      description: z.string().optional(),
      locationText: z.string().optional(),
      photoCount: z.number().optional(),
      message: z.string().optional(),
    }),
  }),

  /**
   * File the complaint - also client-side.
   *
   * The browser already holds the uploaded photo keys and the confirmed
   * form state, and it calls the same server action the written form does,
   * so both routes go through one set of checks rather than two that drift.
   */
  fileComplaint: tool({
    description:
      "File the complaint once the citizen has confirmed the details. Only call this after collectComplaintDetails has come back confirmed.",
    inputSchema: z.object({
      title: z.string().describe("The confirmed complaint title."),
      description: z.string().describe("The confirmed description."),
      locationText: z
        .string()
        .describe("The location as the citizen gave it. Empty if unknown."),
    }),
    outputSchema: z.object({
      filed: z.boolean(),
      reference: z.string().optional(),
      message: z.string(),
    }),
  }),
}

/**
 * The message type the chat is typed against.
 *
 * Derived from the tool definitions, so a wrong tool name or a mismatched
 * output shape in the UI is a type error rather than a runtime surprise the
 * model has to make sense of.
 */
export type ChatUIMessage = UIMessage<
  never,
  UIDataTypes,
  InferUITools<typeof clientTools>
>
