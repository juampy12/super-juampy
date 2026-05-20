import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/pos-login",
  "/api/employee/login",
  "/api/health",
  "/_next",
  "/favicon.ico",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const auth = req.cookies.get("sj_pos_auth")?.value;
  if (!auth) {
    const loginUrl = new URL("/pos-login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/employee/login|api/health).*)",
  ],
};
