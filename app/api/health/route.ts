import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const issues: string[] = [];
  if (!url) issues.push("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!anon) issues.push("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!service) issues.push("Missing SUPABASE_SERVICE_ROLE_KEY (server)");

  try {
    if (url && (service || anon)) {
      const supabase = createClient(url, service ?? anon, { auth: { persistSession: false } });

      // 1) Intento RPC 'now'; si no existe, caemos a un SELECT head:true
      const { error: rpcErr } = await supabase.rpc("now");
      if (rpcErr) {
        const { error: tblErr } = await supabase
          .from("products")
          .select("id", { head: true, count: "exact" });
        if (tblErr) issues.push(`DB ping failed: ${tblErr.message}`);
      }

      // 2) Chequeo básico de tablas
      for (const table of ["products","branches","sales","sale_items"]) {
        const { error } = await supabase.from(table).select("id", { head: true, count: "exact" });
        if (error) issues.push(`Missing or inaccessible table: ${table}`);
      }
    }
  } catch (e: any) {
    issues.push(`Runtime error: ${e?.message ?? e}`);
  }

  const status = issues.length === 0 ? "ok" : "degraded";
  return NextResponse.json(
    { status, issues, env: { hasUrl: !!url, hasAnon: !!anon, hasServiceKey: !!service } },
    { status: status === "ok" ? 200 : 500 }
  );
}
