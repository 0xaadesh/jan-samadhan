import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { requireViewer } from "@/lib/auth-session"
import { unreadCount } from "@/lib/grievance/events"

/**
 * The shell every signed-in page shares.
 *
 * One layout for all three roles - the sidebar's contents differ, not its
 * shape, so a citizen and an admin get the same chrome and the same header.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // The proxy check is optimistic (cookie only), so verify the session here.
  const viewer = await requireViewer()
  const unread = await unreadCount(viewer.id)

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 68)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        variant="inset"
        unread={unread}
        user={{
          name: viewer.name,
          email: viewer.email,
          avatar: viewer.image,
          role: viewer.role,
          departmentName: viewer.departmentName,
          phone: viewer.phone ?? "",
          whatsappNotifications: viewer.whatsappNotifications,
        }}
      />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
