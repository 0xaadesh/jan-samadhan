import type { Role } from "@/lib/roles"

/**
 * What each role sees in the sidebar.
 *
 * One table rather than three sidebar components: the three roles share a
 * shell and differ only in their links, so keeping the difference as data
 * makes "what can a department user reach?" answerable by reading one file.
 * It is also the single source the proxy consults to guard those routes.
 */

export type NavItem = {
  title: string
  url: string
  /** Lucide icon name, resolved in the sidebar - this file stays serialisable. */
  icon: string
  /** Match child routes too, so /complaints/abc keeps Complaints highlighted. */
  prefix?: boolean
}

export type NavSection = {
  label: string
  items: NavItem[]
}

const ADMIN_NAV: NavSection[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: "LayoutDashboardIcon" },
      { title: "Analytics", url: "/analytics", icon: "ChartBarIcon", prefix: true },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Complaints", url: "/complaints", icon: "InboxIcon", prefix: true },
      { title: "Triage queue", url: "/complaints?view=unrouted", icon: "FilterIcon" },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Users", url: "/admin/users", icon: "UsersIcon", prefix: true },
      { title: "Departments", url: "/admin/departments", icon: "Building2Icon", prefix: true },
      { title: "Priority levels", url: "/admin/priorities", icon: "FlagIcon", prefix: true },
      { title: "AI configuration", url: "/admin/ai", icon: "SparklesIcon", prefix: true },
    ],
  },
]

const DEPARTMENT_NAV: NavSection[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: "LayoutDashboardIcon" },
      { title: "Analytics", url: "/analytics", icon: "ChartBarIcon", prefix: true },
    ],
  },
  {
    label: "Queue",
    items: [
      { title: "All complaints", url: "/complaints", icon: "InboxIcon", prefix: true },
      { title: "Unclaimed", url: "/complaints?view=unassigned", icon: "CircleDashedIcon" },
      { title: "Active", url: "/complaints?view=active", icon: "LoaderIcon" },
      { title: "Resolved", url: "/complaints?view=resolved", icon: "CircleCheckIcon" },
    ],
  },
]

const CITIZEN_NAV: NavSection[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: "LayoutDashboardIcon" },
    ],
  },
  {
    label: "Complaints",
    items: [
      { title: "My complaints", url: "/complaints", icon: "InboxIcon", prefix: true },
      { title: "Submit a complaint", url: "/complaints/new", icon: "CirclePlusIcon" },
    ],
  },
  {
    label: "Account",
    items: [
      { title: "Notifications", url: "/notifications", icon: "BellIcon" },
    ],
  },
]

export function navFor(role: Role): NavSection[] {
  if (role === "admin") return ADMIN_NAV
  if (role === "department") return DEPARTMENT_NAV
  return CITIZEN_NAV
}

/** The primary action each role gets as the sidebar's accent button. */
export function primaryActionFor(role: Role) {
  if (role === "citizen") {
    return { title: "Submit a complaint", url: "/complaints/new", icon: "CirclePlusIcon" }
  }
  return null
}

/**
 * Route prefixes only an admin may open.
 *
 * The pages check this themselves via requireAdmin(); listing them here lets
 * the proxy turn away a citizen before the page renders at all.
 */
export const ADMIN_ROUTE_PREFIX = "/admin"
