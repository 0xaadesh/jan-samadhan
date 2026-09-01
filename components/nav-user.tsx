"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { EllipsisVerticalIcon, LogOutIcon, Settings2Icon } from "lucide-react"

import { authClient } from "@/lib/auth-client"
import { SettingsDialog } from "@/components/settings-dialog"
import { useSettingsHash } from "@/hooks/use-settings-hash"
import type { Role } from "@/lib/roles"
import { DEFAULT_SETTINGS_SECTION, settingsHash } from "@/lib/sections"

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
    role: Role
    departmentName: string | null
    phone: string
    whatsappNotifications: boolean
  }
}) {
  const { isMobile } = useSidebar()
  const router = useRouter()
  const { openSection } = useSettingsHash()
  const [isSigningOut, setIsSigningOut] = React.useState(false)

  async function handleSignOut(event: React.MouseEvent) {
    // Keep the menu open so the spinner stays visible until the redirect.
    event.preventDefault()
    setIsSigningOut(true)

    const { error } = await authClient.signOut()

    if (error) {
      setIsSigningOut(false)
      toast.error(error.message ?? "Unable to sign out. Please try again.")
      return
    }

    router.push("/login")
    router.refresh()
  }

  return (
    <>
      <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />
            }
          >
            <Avatar className="size-8 rounded-lg grayscale">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="rounded-lg">
                {user.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-foreground/70">
                {user.email}
              </span>
            </div>
            <EllipsisVerticalIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="rounded-lg">
                      {user.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={isSigningOut}
                    onClick={(event) => {
                      // The href is there so the row reads as a link and can be
                      // opened in a new tab; the click is handled here because
                      // the router's pushState fires no hashchange.
                      event.preventDefault()
                      openSection(DEFAULT_SETTINGS_SECTION)
                    }}
                    render={<a href={settingsHash(DEFAULT_SETTINGS_SECTION)} />}
                  >
                    <Settings2Icon />
                    Settings
                  </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} disabled={isSigningOut}>
              {isSigningOut ? <Spinner /> : <LogOutIcon />}
              {isSigningOut ? "Signing out..." : "Log out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      </SidebarMenu>
      <SettingsDialog user={user} />
    </>
  )
}
