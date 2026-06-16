import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, unauthorized } from "@/lib/session";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const storeFilter = searchParams.get("store_id");

  let q = supabaseAdmin
    .from("registers")
    .select("id, name, store_id")
    .eq("active", true)
    .order("name", { ascending: true });

  if (storeFilter) q = q.eq("store_id", storeFilter);

  const { data, error } = await q;
  if (error) {
    console.error("Error leyendo registers:", error);
    return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
  }
  return NextResponse.json({ registers: data ?? [] });
}
