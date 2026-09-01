import { NotificationList } from "@/components/notification-list"
import { PageBody, PageHeader } from "@/components/page-shell"
import { requireViewer } from "@/lib/auth-session"
import { listNotifications } from "@/lib/grievance/events"

export default async function NotificationsPage() {
  const viewer = await requireViewer()
  const notifications = await listNotifications(viewer.id)

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Status changes and updates on your complaints"
      />
      <PageBody className="max-w-3xl">
        <NotificationList notifications={notifications} />
      </PageBody>
    </>
  )
}
