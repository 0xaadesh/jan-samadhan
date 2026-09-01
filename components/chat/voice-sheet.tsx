"use client"

import * as React from "react"
import { AudioLinesIcon } from "lucide-react"

import { VoiceAssistant } from "@/components/chat/voice-assistant"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

/**
 * The voice assistant, in a sheet that slides in from the right.
 *
 * Mounted only for citizens, for the same reason the written one is: its tools
 * mean "your own complaints", which is not a meaningful scope for someone
 * working a department queue.
 *
 * Unlike the written chat, this is unmounted when the sheet closes. A live
 * session holds a microphone and a WebRTC connection, and keeping those open
 * behind a closed sheet would leave the browser's recording indicator lit with
 * nothing on screen to explain it.
 */
export function VoiceSheet() {
  const [open, setOpen] = React.useState(false)

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        aria-label="Talk to the complaint assistant"
        render={
          <Button size="icon" variant="ghost">
            <AudioLinesIcon />
          </Button>
        }
      />
      <SheetContent
        // Matches the written assistant's width - the same details form lives
        // inside this conversation and needs the same room.
        className="flex w-full flex-col gap-0 p-0 data-[side=right]:sm:max-w-xl"
        side="right"
      >
        <SheetHeader className="shrink-0 border-b">
          <SheetTitle>Talk to the assistant</SheetTitle>
          <SheetDescription>
            Describe a problem out loud, or ask about one you have already
            reported.
          </SheetDescription>
        </SheetHeader>

        {open ? <VoiceAssistant /> : null}
      </SheetContent>
    </Sheet>
  )
}
