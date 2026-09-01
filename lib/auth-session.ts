import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { getSessionCookie } from "better-auth/cookies"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { department, user } from "@/lib/db/schema"
import { isAdmin, isStaff, toRole, type Role } from "@/lib/roles"

/**
 * The signed-in user, with the fields every authorisation decision needs.
 *
 * Role and department are read from the database on each request rather than
 * carried in the session: an admin revoking someone's access must take effect
 * on their next navigation, not whenever their session happens to expire.
 */
export type Viewer = {
  id: string
  name: string
  email: string
  image: string
  role: Role
  departmentId: string | null
  departmentName: string | null
  /** WhatsApp contact, digits only. Empty when the citizen has not set one. */
  phone: string | null
  whatsappNotifications: boolean
}

/**
 * Resolve the session for a protected route, breaking the proxy redirect loop.
 *
 * The proxy can only see that a session *cookie* exists - it never validates
 * it, because that would mean a database round trip on every request. So when a
 * cookie outlives the session it points at (database reset, revoked or expired
 * session, rotated BETTER_AUTH_SECRET, user deleted), the two layers disagree:
 * the proxy sends the "logged in" user onward, the real check here finds
 * nothing and sends them back to /login, and the browser gives up with
 * ERR_TOO_MANY_REDIRECTS.
 *
 * This side holds the authoritative answer but *cannot* act on it: `redirect()`
 * throws before Next flushes any cookie written in a Server Component, and the
 * nextCookies() plugin only covers route handlers. So this side reports the
 * disagreement via ?stale=1 and the proxy - which can write headers - clears
 * the cookie. See proxy.ts.
 */
export async function requireSession() {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })

  if (session) return session

  // Only flag when a cookie is actually present. Flagging unconditionally would
  // put ?stale=1 on the ordinary "logged out user visits a page" redirect,
  // where there is no disagreement and nothing to clear.
  redirect(getSessionCookie(requestHeaders) ? "/login?stale=1" : "/login")
}

/**
 * The signed-in viewer, or a redirect to /login.
 *
 * A disabled account is signed out here rather than at the auth layer, so an
 * admin can revoke access without waiting for the user's session to lapse.
 */
export async function requireViewer(): Promise<Viewer> {
  const session = await requireSession()

  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      active: user.active,
      departmentId: user.departmentId,
      departmentName: department.name,
      phone: user.phone,
      whatsappNotifications: user.whatsappNotifications,
    })
    .from(user)
    .leftJoin(department, eq(user.departmentId, department.id))
    .where(eq(user.id, session.user.id))
    .limit(1)

  if (!row) redirect("/login?stale=1")
  if (!row.active) redirect("/login?disabled=1")

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image ?? "",
    role: toRole(row.role),
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    phone: row.phone,
    whatsappNotifications: row.whatsappNotifications,
  }
}

/** A viewer who must be an admin, or a redirect to their own dashboard. */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer()
  if (!isAdmin(viewer.role)) redirect("/dashboard")
  return viewer
}

/** A viewer who must be staff - a department user or an admin. */
export async function requireStaff(): Promise<Viewer> {
  const viewer = await requireViewer()
  if (!isStaff(viewer.role)) redirect("/dashboard")
  return viewer
}
