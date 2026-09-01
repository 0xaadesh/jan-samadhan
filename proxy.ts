import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

const authRoutes = ["/login", "/signup", "/forgot-password", "/reset-password"]

// Better Auth namespaces every cookie it sets under this prefix, optionally
// behind __Secure- (https) and with .0/.1 suffixes when a value is chunked.
// Keep in sync with `advanced.cookiePrefix` in lib/auth.ts if that is ever set.
const COOKIE_PREFIX = "better-auth"

/**
 * Expire every Better Auth cookie on the response.
 *
 * A server component cannot do this itself: `redirect()` throws before Next flushes
 * cookies set in a Server Component, and the nextCookies() plugin only applies
 * to route handlers. The proxy is the one layer that can both observe the
 * cookie and reliably write headers, so cleanup belongs here.
 */
function clearSessionCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    const name = cookie.name.replace(/^__Secure-/, "")
    if (name === COOKIE_PREFIX || name.startsWith(`${COOKIE_PREFIX}.`)) {
      // Delete under the exact name received, so the __Secure- variant is
      // matched by the same prefix/path the browser stored it with.
      response.cookies.set(cookie.name, "", { maxAge: 0, path: "/" })
    }
  }
}

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Optimistic check only — this reads the cookie without hitting the database.
  // Routes still verify the session themselves before trusting it.
  const hasSession = Boolean(getSessionCookie(request))
  const isAuthRoute = authRoutes.includes(pathname)

  // A cookie can outlive the session it points at (database reset, revoked or
  // expired session, rotated secret, deleted user). requireSession detects that
  // and bounces back with ?stale=1. Without this branch the two layers redirect
  // at each other forever — ERR_TOO_MANY_REDIRECTS.
  //
  // Clearing the cookie here (rather than only whitelisting the flagged URL)
  // is what actually resolves the disagreement: the very next request carries
  // no cookie at all, so every auth route works normally again — including the
  // ones the user navigates to next, like /signup.
  if (hasSession && searchParams.has("stale")) {
    const url = request.nextUrl.clone()
    url.searchParams.delete("stale")
    // Redirect to the clean URL so ?stale=1 does not linger in the address bar
    // or get shared; the cookie is already gone by the time it is followed.
    const response = NextResponse.redirect(url)
    clearSessionCookies(request, response)
    return response
  }

  if (!hasSession && !isAuthRoute) {
    const loginUrl = new URL("/login", request.url)
    // Send the user back where they were headed once they sign in.
    if (pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", pathname)
    }
    return NextResponse.redirect(loginUrl)
  }

  if (hasSession && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

// `matcher` must be statically analyzable, so these paths are spelled out
// rather than spread from `authRoutes` above.
export const config = {
  matcher: [
    "/dashboard",
    "/complaints/:path*",
    "/analytics/:path*",
    "/notifications",
    // Admin pages also call requireAdmin() themselves; this only keeps a
    // signed-out visitor from reaching them at all.
    "/admin/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ],
}
