"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BellIcon,
  Building2Icon,
  ChartBarIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CirclePlusIcon,
  FilterIcon,
  FlagIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LoaderIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react"

import { NavUser } from "@/components/nav-user"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { navFor, primaryActionFor, type NavItem } from "@/lib/navigation"
import { ROLE_INFO, type Role } from "@/lib/roles"

/**
 * Icons are named in lib/navigation.ts rather than imported there, so that
 * module stays plain data and can be read on the server. This map is the one
 * place the names become components.
 */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  BellIcon,
  Building2Icon,
  ChartBarIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CirclePlusIcon,
  FilterIcon,
  FlagIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LoaderIcon,
  SparklesIcon,
  UsersIcon,
}

function Icon({ name, className }: { name: string; className?: string }) {
  const Component = ICONS[name] ?? InboxIcon
  return <Component className={className} />
}

export function AppSidebar({
  user,
  unread = 0,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: {
    name: string
    email: string
    avatar: string
    role: Role
    departmentName: string | null
    phone: string
    whatsappNotifications: boolean
  }
  /** Unread notification count, badged on the Notifications link. */
  unread?: number
}) {
  const pathname = usePathname()
  const sections = navFor(user.role)
  const primary = primaryActionFor(user.role)

  // A link is current when the path matches exactly, or - for `prefix` items -
  // when it opens a child route. Query-only links (?view=) never win on path
  // alone, so they do not all light up at once on /complaints.
  const isActive = (item: NavItem) => {
    const [path, query] = item.url.split("?")
    if (query) return false
    return item.prefix ? pathname.startsWith(path) : pathname === path
  }

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href="/dashboard" />}
            >
              <ShieldCheckIcon className="size-5 text-primary" />
              <span className="text-base font-semibold">Jan Samadhan</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Which hat the viewer is wearing, and for which department - a
            department user's whole view is scoped to it, so it is not a detail
            to bury in a settings dialog. */}
        <div className="flex items-center gap-2 px-2 pb-1">
          <Badge variant="secondary" className="font-normal">
            {ROLE_INFO[user.role].label}
          </Badge>
          {user.departmentName ? (
            <span className="truncate text-xs text-muted-foreground">
              {user.departmentName}
            </span>
          ) : null}
        </div>

        {primary ? (
          <Button className="w-full justify-start" render={<Link href={primary.url} />}>
            <Icon name={primary.icon} />
            {primary.title}
          </Button>
        ) : null}
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      isActive={isActive(item)}
                      tooltip={item.title}
                      render={<Link href={item.url} />}
                    >
                      <Icon name={item.icon} />
                      <span>{item.title}</span>
                      {item.url === "/notifications" && unread > 0 ? (
                        <Badge className="ml-auto h-5 min-w-5 justify-center px-1 tabular-nums">
                          {unread > 99 ? "99+" : unread}
                        </Badge>
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
