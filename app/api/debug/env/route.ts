import { NextResponse } from "next/server";

function looksLikeJwt(s: string) {
  return s.startsWith("eyJ") && s.split(".").length >= 3;
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  return NextResponse.json({
    ok: true,
    hasUrl: Boolean(url),
    hasAnon: Boolean(anon),
    anonLen: anon.length,
    anonLooksJwt: looksLikeJwt(anon),
    hasService: Boolean(service),
    serviceLen: service.length,
    serviceLooksJwt: looksLikeJwt(service),
    sameKeys: anon === service,
  });
}
