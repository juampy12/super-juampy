import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("registers")
    .select("id, name, store_id")
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) {
    console.error("Error leyendo registers:", error);
    return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
  }
  return NextResponse.json({ registers: data ?? [] });
}
