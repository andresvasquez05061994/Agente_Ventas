import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authEnvFromProcess, sessionStatus } from "@/lib/team-auth";

/**
 * Redirección optimista de páginas. No es la barrera de los datos:
 * cada route handler protegido llama a `requireTeamApi`.
 * Las rutas `/api` quedan fuera del matcher (webhooks y login).
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const status = sessionStatus(req.cookies.get(SESSION_COOKIE)?.value, authEnvFromProcess());
  const isLogin = pathname === "/login";

  if (!isLogin && status !== "ok") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isLogin && status === "ok") {
    const url = req.nextUrl.clone();
    url.pathname = "/resumen";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.).*)",
  ],
};
