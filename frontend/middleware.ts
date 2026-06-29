import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveApiBase } from "@/lib/apiBase";
import { DEFAULT_COMPETITION_SLUG, competitionAdminPath } from "@/lib/competitionPaths";
/** Rutas accesibles sin sesión */
const UNAUTH_ALLOWED_PREFIXES = ["/login", "/register", "/forgot-password", "/u/"];
/** Si ya hay sesión, no volver a login/registro */
const AUTH_ENTRY_PREFIXES = ["/login", "/register"];

function apiBaseFromRequest(request: NextRequest): string {
  const { protocol, hostname, port } = request.nextUrl;
  return resolveApiBase({
    configured: process.env.NEXT_PUBLIC_API_URL,
    protocol: protocol.replace(":", ""),
    hostname,
    port,
    origin: request.nextUrl.origin,
  });
}

const LEGACY_OPERATIONAL: Record<string, string> = {
  "/admin/fixtures": "fixtures",
  "/admin/groups": "members",
  "/admin/requests": "requests",
  "/admin/activity": "activity",
  "/admin/live-sync": "live-sync",
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const allowsAnonymous = UNAUTH_ALLOWED_PREFIXES.some((r) => pathname.startsWith(r));
  const isAuthEntry = AUTH_ENTRY_PREFIXES.some((r) => pathname.startsWith(r));
  const accessToken = request.cookies.get("access_token")?.value;

  if (!accessToken && !allowsAnonymous) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (accessToken && isAuthEntry) {
    return NextResponse.redirect(new URL("/competitions", request.url));
  }

  if (accessToken && pathname === "/admin") {
    return NextResponse.redirect(new URL("/admin/competitions", request.url));
  }

  if (accessToken) {
    const legacy = Object.entries(LEGACY_OPERATIONAL).find(([prefix]) =>
      pathname.startsWith(prefix),
    );
    if (legacy) {
      return NextResponse.redirect(
        new URL(competitionAdminPath(DEFAULT_COMPETITION_SLUG, legacy[1]), request.url),
      );
    }
  }
  if (accessToken && pathname.startsWith("/admin")) {
    try {
      const meRes = await fetch(`${apiBaseFromRequest(request)}/api/v1/users/me`, {
        headers: { Cookie: `access_token=${accessToken}` },
        cache: "no-store",
      });
      if (meRes.ok) {
        const me = await meRes.json();
        if (!me.is_admin) {
          return NextResponse.redirect(new URL("/dashboard", request.url));
        }
      } else if (meRes.status === 401) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
      } else {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|avatars/|pdfs/|image/|health).*)",
  ],
};
