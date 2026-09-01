"use client"

import * as React from "react"
import { CircleUserRoundIcon, ShieldIcon } from "lucide-react"

import { AccountSection } from "@/components/settings/account-section"
import { ProfileSection } from "@/components/settings/profile-section"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useIsMobile } from "@/hooks/use-mobile"
import { useSettingsHash } from "@/hooks/use-settings-hash"
import type { Role } from "@/lib/roles"
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  settingsHash,
  type SettingsSectionId,
} from "@/lib/sections"

const navItems: {
  id: SettingsSectionId
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}[] = [
  { id: "profile", icon: CircleUserRoundIcon },
  { id: "account", icon: ShieldIcon },
]

export function SettingsDialog({
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
  const { section, selectSection, close } = useSettingsHash()
  const isMobile = useIsMobile()

  const active = section ?? DEFAULT_SETTINGS_SECTION

  const content =
    active === "account" ? (
      <AccountSection
        role={user.role}
        departmentName={user.departmentName}
        createdAt="--"
      />
    ) : (
      <ProfileSection user={user} />
    )

  return (
    <Dialog
      open={section !== null}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent className="overflow-hidden p-0 sm:max-w-[min(56rem,calc(100vw-2rem))]">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Manage your profile and see what your account can do.
        </DialogDescription>
        {isMobile ? (
          // No room for a sidebar — the sections become a tab strip instead.
          <Tabs
            className="flex h-[85vh] min-h-0 flex-col gap-0"
            onValueChange={(value) => selectSection(value as SettingsSectionId)}
            value={active}
          >
            <div className="flex shrink-0 flex-col gap-3 border-b p-3">
              <TabsList className="w-full justify-start">
                {navItems.map((item) => (
                  <TabsTrigger
                    className="flex-none whitespace-nowrap"
                    key={item.id}
                    value={item.id}
                  >
                    <item.icon />
                    {SETTINGS_SECTIONS[item.id]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {navItems.map((item) => (
              <TabsContent
                className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4"
                key={item.id}
                value={item.id}
              >
                {active === item.id ? content : null}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <SidebarProvider
            // `min-w-0` here as well as on <main>: DialogContent is a grid, and
            // a grid item's implicit `min-width: auto` keeps this row from
            // shrinking below its content.
            className="h-[min(640px,85vh)] min-h-0 w-full min-w-0 items-start"
            style={{ "--sidebar-width": "14rem" } as React.CSSProperties}
          >
            <Sidebar collapsible="none" className="shrink-0 border-r">
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupLabel>Settings</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {navItems.map((item) => (
                        <SidebarMenuItem key={item.id}>
                          <SidebarMenuButton
                            isActive={active === item.id}
                            render={<a href={settingsHash(item.id)} />}
                            onClick={(event) => {
                              event.preventDefault()
                              selectSection(item.id)
                            }}
                          >
                            <item.icon />
                            <span>{SETTINGS_SECTIONS[item.id]}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>
            <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-popover">
              <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
                <h2 className="text-sm font-medium">
                  {SETTINGS_SECTIONS[active]}
                </h2>
              </header>
              <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
                {content}
              </div>
            </main>
          </SidebarProvider>
        )}
      </DialogContent>
    </Dialog>
  )
}
