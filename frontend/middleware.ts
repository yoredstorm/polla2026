import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveApiBase } from "@/lib/apiBase";

/** Rutas accesibles sin sesión */
const UNAUTH_ALLOWED_PREFIXES = ["/login", "/register", "/u/"];
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
    return NextResponse.redirect(new URL("/dashboard", request.url));
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
      }
    } catch {
      // Allow through; admin layout will re-check
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|avatars/|image/|health).*)",
  ],
};
