import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const id = String(body?.id ?? "").trim();
    if (!id) return NextResponse.json({ ok: false, error: "Falta id" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("products")
      .update({ active: false })
      .eq("id", id)
      .select("id,sku,name,price,active")
      .single();

    if (error) {
      console.error("Error desactivando producto:", error);
      return NextResponse.json({ ok: false, error: "Error al procesar la operación" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, product: data });
  } catch (e: any) {
    console.error("Error inesperado en /api/products/deactivate:", e);
    return NextResponse.json({ ok: false, error: "Error inesperado" }, { status: 500 });
  }
}
