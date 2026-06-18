import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const issues: string[] = [];
  if (!url) issues.push("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!service) issues.push("Missing SUPABASE_SERVICE_ROLE_KEY (server)");

  try {
    if (url && service) {
      const supabase = createClient(url, service, {
        auth: { persistSession: false },
      });

      const { error: rpcErr } = await supabase.rpc("now");
      if (rpcErr) {
        const { error: tblErr } = await supabase
          .from("products")
          .select("id", { head: true, count: "exact" });
        if (tblErr) issues.push(`DB ping failed: ${tblErr.message}`);
      }

      for (const table of ["products", "stores", "sales", "sale_items"]) {
        const { error } = await supabase
          .from(table)
          .select("id", { head: true, count: "exact" });
        if (error) issues.push(`Missing or inaccessible table: ${table}`);
      }
    }
  } catch (e: any) {
    issues.push(`Runtime error: ${e?.message ?? e}`);
  }

  const status = issues.length === 0 ? "ok" : "degraded";
  return NextResponse.json(
    {
      status,
      issues,
    },
    { status: status === "ok" ? 200 : 500 }
  );
}
