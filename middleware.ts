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
  "/robots.txt",
  "/sitemap.xml",
  "/.well-known/",
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : "";

// CSP estático (sin nonce): Next.js 16 App Router pre-renderiza páginas como HTML
// estático en build-time — el middleware solo puede agregar headers, no modificar
// el HTML generado. Los nonces requieren rendering dinámico por request para
// inyectarse en los scripts; con páginas estáticas son incompatibles.
// 'self' bloquea scripts de dominios externos (CDNs externos, third-party trackers).
// 'unsafe-inline' es necesario para los RSC payload scripts de hidratación
// (self.__next_f.push(...)) que Next.js genera inline y no puede externalizar.
function buildCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' https://${supabaseHost} wss://${supabaseHost}`,
    "worker-src 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
  ].join("; ");
}

const CSP = buildCsp();

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", CSP);
    return response;
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
    response.cookies.set("sj_pos_auth", "", { maxAge: 0, path: "/" });
    return response;
  }

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", CSP);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|favicon.svg|sw.js|workbox-|manifest.json|robots.txt|sitemap.xml|\\.well-known/|icon-192.png|icon-512.png|logo.*\\.png|logo.*\\.svg|api/employee/login|api/health).*)",
  ],
};
