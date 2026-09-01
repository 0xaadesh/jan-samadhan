import { DepartmentsManager } from "@/components/admin/departments-manager"
import { PageBody, PageHeader } from "@/components/page-shell"
import { requireAdmin } from "@/lib/auth-session"
import { listDepartments } from "@/lib/grievance/admin"

export default async function DepartmentsPage() {
  await requireAdmin()

  const departments = await listDepartments()

  return (
    <>
      <PageHeader
        title="Departments"
        description="The units complaints are routed to"
      />
      <PageBody className="max-w-4xl">
        <DepartmentsManager departments={departments} />
      </PageBody>
    </>
  )
}
