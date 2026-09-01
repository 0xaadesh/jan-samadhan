import { PrioritiesManager } from "@/components/admin/priorities-manager"
import { PageBody, PageHeader } from "@/components/page-shell"
import { requireAdmin } from "@/lib/auth-session"
import { listPriorities } from "@/lib/grievance/admin"

export default async function PrioritiesPage() {
  await requireAdmin()

  const priorities = await listPriorities()

  return (
    <>
      <PageHeader
        title="Priority levels"
        description="How complaints are ranked and what the AI ranks them against"
      />
      <PageBody className="max-w-4xl">
        <PrioritiesManager priorities={priorities} />
      </PageBody>
    </>
  )
}
