import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();
    if (!isSupervisor(session)) return forbidden("Solo supervisores pueden buscar productos para marketing");

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) {
      return NextResponse.json({ products: [] });
    }

    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id, name, price")
      .eq("active", true)
      .gt("price", 0)
      .ilike("name", `%${q}%`)
      .order("name")
      .limit(10);

    if (error) {
      console.error("Error buscando productos:", error);
      return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
    }

    const products = data ?? [];
    const productIds = products.map((p) => p.id);

    let offerByProduct = new Map<
      string,
      { type: string; value: number; qty_buy: number | null; qty_pay: number | null }
    >();
    if (productIds.length > 0) {
      const nowIso = new Date().toISOString();
      const { data: offers, error: offersError } = await supabaseAdmin
        .from("product_offers")
        .select("product_id, type, value, qty_buy, qty_pay")
        .in("product_id", productIds)
        .eq("is_active", true)
        .lte("starts_at", nowIso)
        .gte("ends_at", nowIso);

      if (offersError) {
        console.error("Error buscando ofertas:", offersError);
      } else {
        offerByProduct = new Map(
          (offers ?? []).map((o) => [
            o.product_id,
            {
              type: o.type,
              value: Number(o.value),
              qty_buy: o.qty_buy != null ? Number(o.qty_buy) : null,
              qty_pay: o.qty_pay != null ? Number(o.qty_pay) : null,
            },
          ])
        );
      }
    }

    const productsWithOffers = products.map((p) => ({
      ...p,
      offer: offerByProduct.get(p.id),
    }));

    return NextResponse.json({ products: productsWithOffers });
  } catch (e) {
    console.error("Error en /api/marketing/products:", e);
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
