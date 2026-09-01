import { UsersManager } from "@/components/admin/users-manager"
import { PageBody, PageHeader } from "@/components/page-shell"
import { requireAdmin } from "@/lib/auth-session"
import { listActiveDepartments, listUsers } from "@/lib/grievance/admin"

export default async function UsersPage() {
  const viewer = await requireAdmin()

  const [users, departments] = await Promise.all([
    listUsers(),
    listActiveDepartments(),
  ])

  return (
    <>
      <PageHeader
        title="Users"
        description="Roles, department assignments and account access"
      />
      <PageBody>
        <UsersManager
          departments={departments}
          users={users}
          viewerId={viewer.id}
        />
      </PageBody>
    </>
  )
}
