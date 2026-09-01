"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { authClient } from "@/lib/auth-client"
import { updateWhatsAppSettingsAction } from "@/lib/grievance/actions"
import type { Role } from "@/lib/roles"

/** Up to two initials for the avatar fallback. */
export function initialsOf(name: string) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return initials || "?"
}

export function ProfileSection({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
    role: Role
    phone: string
    whatsappNotifications: boolean
  }
}) {
  const router = useRouter()

  const [name, setName] = React.useState(user.name)
  const [isSaving, setIsSaving] = React.useState(false)

  const [phone, setPhone] = React.useState(user.phone)
  const [whatsapp, setWhatsapp] = React.useState(user.whatsappNotifications)
  const [isSavingWhatsApp, setIsSavingWhatsApp] = React.useState(false)

  // Staff get their queues in the app; the WhatsApp channel is for citizens
  // following their own complaints.
  const isCitizen = user.role === "citizen"

  const phoneDirty =
    phone.trim() !== user.phone || whatsapp !== user.whatsappNotifications

  /**
   * Save the number and the toggle together.
   *
   * One action rather than two, because the toggle is only meaningful with a
   * number attached - saving them separately would allow a moment where the
   * switch is on and there is nothing to deliver to.
   */
  const saveWhatsApp = async (next: { phone: string; enabled: boolean }) => {
    setIsSavingWhatsApp(true)

    try {
      const saved = await updateWhatsAppSettingsAction(next)
      setPhone(saved.phone)
      setWhatsapp(saved.enabled)
      toast.success(
        saved.enabled
          ? "WhatsApp updates are on."
          : "WhatsApp updates are off.",
      )
      router.refresh()
    } catch (cause) {
      // Put the switch back where it was - it must never show a state the
      // server did not accept.
      setWhatsapp(user.whatsappNotifications)
      toast.error(
        cause instanceof Error ? cause.message : "Could not save that.",
      )
    } finally {
      setIsSavingWhatsApp(false)
    }
  }

  const isDirty = name.trim() !== user.name

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!name.trim() || isSaving) {
      return
    }

    setIsSaving(true)

    const { error } = await authClient.updateUser({ name: name.trim() })

    setIsSaving(false)

    if (error) {
      toast.error(error.message ?? "Could not save your profile.")
      return
    }

    toast.success("Profile updated.")
    // The name is rendered by a server component in the sidebar, so the tree
    // has to be refetched for the change to show up outside this dialog.
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Avatar className="size-12">
          {user.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
          <AvatarFallback>{initialsOf(name || user.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{user.name}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="profile-name">Name</FieldLabel>
            <Input
              id="profile-name"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
            <FieldDescription>
              Shown beside your avatar in the sidebar.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-email">Email</FieldLabel>
            <Input id="profile-email" disabled readOnly value={user.email} />
            <FieldDescription>
              Changing your email isn’t supported yet.
            </FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <Button disabled={!isDirty || isSaving} type="submit">
              {isSaving ? <Spinner /> : null}
              Save changes
            </Button>
          </Field>
        </FieldGroup>
      </form>

      {isCitizen ? (
        <div className="flex flex-col gap-4 border-t pt-6">
          <div>
            <h3 className="font-medium">WhatsApp updates</h3>
            <p className="text-sm text-muted-foreground">
              Get a message whenever one of your complaints moves - filed,
              triaged, assigned, in progress and resolved.
            </p>
          </div>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="profile-phone">WhatsApp number</FieldLabel>
              <Input
                id="profile-phone"
                inputMode="tel"
                onChange={(event) => setPhone(event.target.value)}
                placeholder="918097920998"
                value={phone}
              />
              <FieldDescription>
                Include the country code, digits only - for example
                918097920998 for an Indian number.
              </FieldDescription>
            </Field>

            <Field orientation="horizontal">
              <Switch
                aria-label="WhatsApp notifications"
                checked={whatsapp}
                disabled={isSavingWhatsApp || (!whatsapp && !phone.trim())}
                id="profile-whatsapp"
                onCheckedChange={(checked) => {
                  setWhatsapp(checked)
                  void saveWhatsApp({ phone, enabled: checked })
                }}
              />
              <FieldLabel htmlFor="profile-whatsapp">
                Send me WhatsApp updates
              </FieldLabel>
            </Field>

            {phoneDirty ? (
              <Field orientation="horizontal">
                <Button
                  disabled={isSavingWhatsApp}
                  onClick={() => void saveWhatsApp({ phone, enabled: whatsapp })}
                  type="button"
                  variant="outline"
                >
                  {isSavingWhatsApp ? <Spinner /> : null}
                  Save number
                </Button>
              </Field>
            ) : null}
          </FieldGroup>
        </div>
      ) : null}
    </div>
  )
}
