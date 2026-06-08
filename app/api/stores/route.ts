import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
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
