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
  "/.well-known/",
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : "";

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // nonce permite los inline scripts de hidratación del App Router; strict-dynamic
    // propaga la confianza a los chunks cargados dinámicamente por Next.js.
    // 'self' actúa como fallback para navegadores que no soporten strict-dynamic.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // unsafe-inline necesario para atributos style="" (React) y bloques <style> de Next.js.
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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Propagar nonce al layout server-side via header de request
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set("Content-Security-Policy", csp);
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
    // Borra la cookie inválida o expirada
    response.cookies.set("sj_pos_auth", "", { maxAge: 0, path: "/" });
    return response;
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Excluye assets estáticos, SW, manifest, robots, well-known e íconos del guard de auth
    "/((?!_next/static|_next/image|favicon.ico|favicon.svg|sw.js|workbox-|manifest.json|robots.txt|\\.well-known/|icon-192.png|icon-512.png|logo.*\\.png|logo.*\\.svg|api/employee/login|api/health).*)",
  ],
};
