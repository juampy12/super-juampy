import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();
    if (!isSupervisor(session)) return forbidden("Solo supervisores pueden acceder al módulo de marketing");

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    const [productsRes, stocksRes, offersRes, salesRes] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id, name, price, active")
        .eq("active", true)
        .gt("price", 0)
        .limit(300),
      supabaseAdmin
        .from("product_stocks")
        .select("product_id, stock"),
      supabaseAdmin
        .from("product_offers")
        .select("product_id, type, value")
        .eq("is_active", true)
        .lte("starts_at", nowIso)
        .gte("ends_at", nowIso)
        .limit(50),
      supabaseAdmin
        .from("sale_items")
        .select("product_id, quantity")
        .gte("created_at", weekAgo),
    ]);

    if (productsRes.error) {
      console.error("Error en suggestions/products:", productsRes.error);
      return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
    }

    // Build product map
    const productMap = new Map<string, { id: string; name: string; price: number }>();
    for (const p of productsRes.data ?? []) {
      productMap.set(p.id, { id: p.id, name: p.name, price: Number(p.price) });
    }

    // Aggregate stock across stores per product
    const stockByProduct: Record<string, number> = {};
    for (const s of stocksRes.data ?? []) {
      stockByProduct[s.product_id] = (stockByProduct[s.product_id] ?? 0) + Number(s.stock);
    }

    // Units sold last 7 days per product
    const soldByProduct: Record<string, number> = {};
    for (const s of salesRes.data ?? []) {
      soldByProduct[s.product_id] = (soldByProduct[s.product_id] ?? 0) + Number(s.quantity);
    }

    // Active offers
    const offerByProduct = new Map<string, { type: string; value: number }>();
    for (const o of offersRes.data ?? []) {
      offerByProduct.set(o.product_id, { type: o.type, value: Number(o.value) });
    }

    const suggestions: Array<{
      id: string;
      name: string;
      price: number;
      reason: string;
      stock: number;
      sold7d: number;
      offer?: { type: string; value: number };
    }> = [];

    const seen = new Set<string>();

    // Priority 1: products with active offers
    for (const [productId, offer] of offerByProduct) {
      if (seen.size >= 3) break;
      const prod = productMap.get(productId);
      if (!prod) continue;
      seen.add(productId);
      const discountLabel =
        offer.type === "percent"
          ? `${offer.value}% de descuento`
          : `Precio especial $${Number(offer.value).toLocaleString("es-AR")}`;
      suggestions.push({
        id: prod.id, name: prod.name, price: prod.price,
        reason: `Oferta activa — ${discountLabel}`,
        stock: stockByProduct[productId] ?? 0,
        sold7d: soldByProduct[productId] ?? 0,
        offer,
      });
    }

    // Priority 2: high stock (>50) + low rotation, fill up to 5
    const highStockCandidates = Object.entries(stockByProduct)
      .filter(([id, stock]) => stock > 50 && !seen.has(id) && productMap.has(id))
      .map(([id, stock]) => ({ id, stock, sold7d: soldByProduct[id] ?? 0 }))
      .sort((a, b) => {
        // Score: high stock with low sales = priority
        const scoreA = a.stock - a.sold7d * 3;
        const scoreB = b.stock - b.sold7d * 3;
        return scoreB - scoreA;
      });

    for (const c of highStockCandidates) {
      if (suggestions.length >= 5) break;
      const prod = productMap.get(c.id)!;
      seen.add(c.id);
      const reason =
        c.sold7d === 0
          ? `Stock alto (${c.stock} unid.) — sin ventas esta semana`
          : `Stock alto (${c.stock} unid.) — baja rotación (${c.sold7d} vendidas esta semana)`;
      suggestions.push({
        id: prod.id, name: prod.name, price: prod.price,
        reason, stock: c.stock, sold7d: c.sold7d,
      });
    }

    return NextResponse.json({ suggestions });
  } catch (e) {
    console.error("Error en /api/marketing/suggestions:", e);
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
