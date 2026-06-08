import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/jwt";

const PUBLIC_PATHS = [
  "/pos-login",
  "/api/employee/login",
  "/api/health",
  "/_next",
  "/favicon.ico",
  "/sw.js",
  "/workbox-",
  "/manifest.json",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("sj_pos_auth")?.value;
  if (!token) {
    const loginUrl = new URL("/pos-login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const session = await verifySession(token);
  if (!session) {
    const loginUrl = new URL("/pos-login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    const response = NextResponse.redirect(loginUrl);
    // Borra la cookie inválida o expirada
    response.cookies.set("sj_pos_auth", "", { maxAge: 0, path: "/" });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Excluye assets estáticos, SW, manifest e íconos PNG del guard de auth
    "/((?!_next/static|_next/image|favicon.ico|favicon.svg|sw.js|workbox-|manifest.json|icon-192.png|icon-512.png|logo.*\\.png|logo.*\\.svg|api/employee/login|api/health).*)",
  ],
};
