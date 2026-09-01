"use client"

import * as React from "react"
import { MessagesSquareIcon } from "lucide-react"

import { ComplaintChat } from "@/components/chat/complaint-chat"
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
 * The assistant, in a sheet that slides in from the right.
 *
 * Mounted only for citizens - staff get the queue views, and the assistant's
 * tools are scoped to "your own complaints", which is not a meaningful scope
 * for someone who works a department queue.
 *
 * The chat is kept mounted once opened, so closing the sheet to look something
 * up on the page behind it does not throw away the conversation.
 */
export function ChatSheet() {
  const [open, setOpen] = React.useState(false)
  const [opened, setOpened] = React.useState(false)

  React.useEffect(() => {
    if (open) setOpened(true)
  }, [open])

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        aria-label="Open the complaint assistant"
        render={
          <Button size="icon" variant="ghost">
            <MessagesSquareIcon />
          </Button>
        }
      />
      <SheetContent
        // Wider than the default sheet: the details form lives inside the
        // conversation, and a title, a description and a row of photo
        // thumbnails all need to be readable at once.
        // The variant chain has to match the sheet's own
        // `data-[side=right]:sm:max-w-sm`, or that more specific selector wins
        // and the width silently stays narrow.
        className="flex w-full flex-col gap-0 p-0 data-[side=right]:sm:max-w-xl"
        side="right"
      >
        <SheetHeader className="shrink-0 border-b">
          <SheetTitle>Complaint assistant</SheetTitle>
          <SheetDescription>
            Report a problem or check on one you have already reported.
          </SheetDescription>
        </SheetHeader>

        {/*
          No wrapper div: the chat is itself a flex column and needs to be a
          direct flex child of the popup, or its own flex-1 measures against a
          wrapper that has no height of its own and the composer lands below
          the fold.
        */}
        {opened ? <ComplaintChat /> : null}
      </SheetContent>
    </Sheet>
  )
}
