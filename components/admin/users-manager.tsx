"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { EmptyState } from "@/components/page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { setUserActiveAction, setUserRoleAction } from "@/lib/grievance/actions"
import type { ManagedUser } from "@/lib/grievance/admin"
import { ROLES, ROLE_INFO, type Role } from "@/lib/roles"

const NONE = "__none"

/**
 * Base UI's Select renders the raw value unless Root is given an `items` map.
 * Roles are a fixed set, so this one is module-level.
 */
const roleItems: Record<string, string> = Object.fromEntries(
  ROLES.map((role) => [role, ROLE_INFO[role].label]),
)

export function UsersManager({
  users,
  departments,
  viewerId,
}: {
  users: ManagedUser[]
  departments: { id: string; name: string }[]
  viewerId: string
}) {
  const router = useRouter()

  const [tab, setTab] = React.useState<"all" | Role>("all")
  const [search, setSearch] = React.useState("")
  const [pending, setPending] = React.useState<string | null>(null)

  const departmentItems = React.useMemo<Record<string, string>>(
    () => ({
      [NONE]: "Unassigned",
      ...Object.fromEntries(departments.map((e) => [e.id, e.name])),
    }),
    [departments],
  )

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    if (pending) return

    setPending(key)

    try {
      await action()
      toast.success(success)
      router.refresh()
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "That did not work.",
      )
    } finally {
      setPending(null)
    }
  }

  const visible = users.filter((entry) => {
    if (tab !== "all" && entry.role !== tab) return false

    if (!search.trim()) return true

    const term = search.trim().toLowerCase()
    return (
      entry.name.toLowerCase().includes(term) ||
      entry.email.toLowerCase().includes(term)
    )
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs onValueChange={(value) => setTab(value as "all" | Role)} value={tab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {ROLES.map((role) => (
              <TabsTrigger key={role} value={role}>
                {ROLE_INFO[role].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative ml-auto w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or email"
            value={search}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No users match"
          description="Try a different role or search term."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">User</TableHead>
                <TableHead className="w-[150px]">Role</TableHead>
                <TableHead className="w-[190px]">Department</TableHead>
                <TableHead className="text-right">Complaints</TableHead>
                <TableHead className="w-[100px] text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((entry) => {
                const isSelf = entry.id === viewerId

                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{entry.name}</p>
                        {isSelf ? (
                          <Badge variant="outline" className="font-normal">
                            You
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {entry.email}
                      </p>
                    </TableCell>

                    <TableCell>
                      <Select
                        disabled={pending !== null}
                        items={roleItems}
                        onValueChange={(value) => {
                          if (!value) return
                          run(
                            `role-${entry.id}`,
                            () =>
                              setUserRoleAction(
                                entry.id,
                                value,
                                // Promoting to department keeps whatever they
                                // already had; the picker beside it sets it.
                                value === "department"
                                  ? (entry.departmentId ??
                                    departments[0]?.id ??
                                    null)
                                  : null,
                              ),
                            "Role updated.",
                          )
                        }}
                        value={entry.role}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_INFO[role].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    <TableCell>
                      {entry.role === "department" ? (
                        <Select
                          disabled={pending !== null}
                          items={departmentItems}
                          onValueChange={(value) => {
                            if (!value) return
                            run(
                              `dept-${entry.id}`,
                              () =>
                                setUserRoleAction(
                                  entry.id,
                                  "department",
                                  value === NONE ? null : value,
                                ),
                              "Department updated.",
                            )
                          }}
                          value={entry.departmentId ?? NONE}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((department) => (
                              <SelectItem
                                key={department.id}
                                value={department.id}
                              >
                                {department.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {entry.role === "admin" ? "All departments" : "--"}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {entry.complaintCount}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        disabled={pending !== null || isSelf}
                        onClick={() =>
                          run(
                            `active-${entry.id}`,
                            () => setUserActiveAction(entry.id, !entry.active),
                            entry.active ? "Account disabled." : "Account enabled.",
                          )
                        }
                        size="sm"
                        variant={entry.active ? "ghost" : "outline"}
                      >
                        {pending === `active-${entry.id}` ? <Spinner /> : null}
                        {entry.active ? "Disable" : "Enable"}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
