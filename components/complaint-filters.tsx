"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { COMPLAINT_STATUSES, STATUS_INFO } from "@/lib/grievance/status"

/** The sentinel a Select uses for "no filter" - an empty value is not allowed. */
const ANY = "__any"

/**
 * Base UI's Select renders the raw `value` in its trigger unless Root is given
 * an `items` map. Without it a closed dropdown shows a uuid, so every Select
 * here passes one built from the same list it renders as options.
 */
const statusItems: Record<string, string> = {
  [ANY]: "Any status",
  ...Object.fromEntries(
    COMPLAINT_STATUSES.map((status) => [status, STATUS_INFO[status].label]),
  ),
}

/**
 * Filters that live in the URL.
 *
 * Deliberately URL state rather than component state: a filtered queue is
 * something staff share with each other and reload all day, and it must
 * survive both.
 */
export function ComplaintFilters({
  departments,
  priorities,
  showDepartment,
}: {
  departments: { id: string; name: string }[]
  priorities: { id: string; name: string }[]
  showDepartment: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [search, setSearch] = React.useState(params.get("q") ?? "")

  // Derived from props, so a renamed department shows its new name at once.
  const priorityItems = React.useMemo<Record<string, string>>(
    () => ({
      [ANY]: "Any priority",
      ...Object.fromEntries(priorities.map((e) => [e.id, e.name])),
    }),
    [priorities],
  )

  const departmentItems = React.useMemo<Record<string, string>>(
    () => ({
      [ANY]: "Any department",
      ...Object.fromEntries(departments.map((e) => [e.id, e.name])),
    }),
    [departments],
  )

  const apply = React.useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString())

      if (value && value !== ANY) {
        next.set(key, value)
      } else {
        next.delete(key)
      }

      // A changed filter invalidates the named view it came from - otherwise
      // "Resolved" plus status=in_progress would silently contradict itself.
      if (key === "status") next.delete("view")

      router.push(next.size > 0 ? `${pathname}?${next}` : pathname)
    },
    [params, pathname, router],
  )

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault()
    apply("q", search.trim() || null)
  }

  const hasFilters =
    params.has("q") ||
    params.has("status") ||
    params.has("department") ||
    params.has("priority") ||
    params.has("view")

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form onSubmit={submitSearch} className="relative flex-1 sm:max-w-xs">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search title, description or reference"
          value={search}
        />
      </form>

      <Select
        items={statusItems}
        value={params.get("status") ?? ANY}
        onValueChange={(value) => apply("status", value)}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any status</SelectItem>
          {COMPLAINT_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {STATUS_INFO[status].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={priorityItems}
        value={params.get("priority") ?? ANY}
        onValueChange={(value) => apply("priority", value)}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any priority</SelectItem>
          {priorities.map((entry) => (
            <SelectItem key={entry.id} value={entry.id}>
              {entry.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showDepartment ? (
        <Select
          items={departmentItems}
          value={params.get("department") ?? ANY}
          onValueChange={(value) => apply("department", value)}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any department</SelectItem>
            {departments.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {hasFilters ? (
        <Button
          onClick={() => {
            setSearch("")
            router.push(pathname)
          }}
          size="sm"
          variant="ghost"
        >
          <XIcon />
          Clear
        </Button>
      ) : null}
    </div>
  )
}
