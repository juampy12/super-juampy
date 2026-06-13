import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, unauthorized } from "@/lib/session";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  const { data, error } = await supabaseAdmin
    .from("stores")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) {
    console.error("Error leyendo stores:", error);
    return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
  }
  return NextResponse.json({ stores: data ?? [] });
}
