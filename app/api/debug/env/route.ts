import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    has_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    has_anon: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    has_service: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    url_prefix: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").slice(0, 60),
    anon_prefix: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").slice(0, 20),
    anon_len: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").length,
    service_prefix: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").slice(0, 20),
    service_len: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").length,
  });
}
