import { NextResponse, type NextRequest } from "next/server";
import {
  hasSession,
  isAuthConfigured,
  isAuthRequired,
  requestProvidesWebhookToken,
  unauthorizedJson,
} from "@/lib/auth";

const PUBLIC_PREFIXES = ["/login", "/api/auth/login", "/api/auth/session", "/api/health"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/api/apollo/phone-webhook" || pathname.startsWith("/api/apollo/phone-webhook/")) {
    if (!requestProvidesWebhookToken(request, "apollo")) return unauthorizedJson();
    return NextResponse.next();
  }

  if (pathname === "/api/whatsapp/webhook") {
    if (!requestProvidesWebhookToken(request, "whatsapp")) return unauthorizedJson();
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) return NextResponse.next();

  if (!isAuthRequired()) return NextResponse.next();

  if (!isAuthConfigured()) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "APP_PASSWORD no configurada en el servidor." },
        { status: 503 }
      );
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("setup", "1");
    return NextResponse.redirect(login);
  }

  if (hasSession(request)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return unauthorizedJson();

  const login = new URL("/login", request.url);
  const next = `${pathname}${request.nextUrl.search}`;
  if (next && next !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logos/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
