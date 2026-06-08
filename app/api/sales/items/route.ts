import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, unauthorized } from "@/lib/session";

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();

    const { searchParams } = new URL(req.url);
    const sale_id = searchParams.get("sale_id");

    if (!sale_id) {
      return NextResponse.json({ error: "Falta sale_id" }, { status: 400 });
    }

    const { data: sale, error: saleErr } = await supabaseAdmin
      .from("sales")
      .select("id, store_id")
      .eq("id", sale_id)
      .maybeSingle();

    if (saleErr) {
      console.error("Error leyendo venta:", saleErr);
      return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
    }
    if (!sale) {
      return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
    }

    if (session.role !== "supervisor" && session.store_id !== sale.store_id) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const { data: items, error: itemsErr } = await supabaseAdmin
      .from("sale_items")
      .select("product_id, quantity, unit_price")
      .eq("sale_id", sale_id);

    if (itemsErr) {
      console.error("Error leyendo items de venta:", itemsErr);
      return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
    }

    const rows = items ?? [];
    const productIds = [...new Set(rows.map((r: any) => r.product_id))];

    const { data: products, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("id, name")
      .in("id", productIds);

    if (prodErr) {
      console.error("Error leyendo nombres de productos:", prodErr);
      return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
    }

    const nameMap: Record<string, string> = {};
    for (const p of products ?? []) nameMap[p.id] = p.name;

    const mapped = rows.map((item: any) => ({
      product_id: item.product_id,
      name: nameMap[item.product_id] ?? "Producto",
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
    }));

    return NextResponse.json({ data: mapped });
  } catch (e) {
    console.error("Error en /api/sales/items:", e);
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
