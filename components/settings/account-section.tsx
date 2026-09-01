"use client"

import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ROLE_INFO, type Role } from "@/lib/roles"

/**
 * What this account is, and what it may do.
 *
 * Read-only on purpose: a user cannot promote themselves, so showing the role
 * with an explanation of what it grants is more honest than a disabled form
 * control that implies it might be editable.
 */
export function AccountSection({
  role,
  departmentName,
  createdAt,
}: {
  role: Role
  departmentName: string | null
  createdAt: string
}) {
  const info = ROLE_INFO[role]

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Role</h3>
          <p className="text-sm text-muted-foreground">
            Roles are assigned by an administrator.
          </p>
        </div>

        <div className="rounded-xl border p-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{info.label}</Badge>
            {departmentName ? (
              <span className="text-sm text-muted-foreground">
                {departmentName}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {info.description}
          </p>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Account</h3>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Member since</dt>
            <dd className="mt-0.5 font-medium">{createdAt}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Department</dt>
            <dd className="mt-0.5 font-medium">{departmentName ?? "None"}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
