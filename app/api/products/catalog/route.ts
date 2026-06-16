import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, unauthorized } from "@/lib/session";

// POST /api/products/catalog
// Body:
//   { q?, active?, skus?, limit?, offset?, include_count? }
//   - q: search term (name ilike or sku exact when numeric)
//   - active: "true" | "false" | "all"  (default "true")
//   - skus: string[] — batch lookup by SKU list (ignores q)
//   - limit: number (default 200, max 1000)
//   - offset: number (default 0)
//   - include_count: boolean — include total count in response

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  const body = await req.json().catch(() => ({}));

  const q: string | null = body.q ? String(body.q).trim() : null;
  const activeParam: string = String(body.active ?? "true");
  const skus: string[] | null = Array.isArray(body.skus) ? body.skus : null;
  const limit = Math.min(Number(body.limit ?? 200), 1000);
  const offset = Math.max(Number(body.offset ?? 0), 0);
  const includeCount = Boolean(body.include_count);

  // Batch mode: lookup by explicit list of SKUs
  if (skus !== null) {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id, sku, name, price, active")
      .in("sku", skus)
      .eq("active", activeParam === "false" ? false : true);

    if (error) {
      console.error("products/catalog batch error:", error);
      return NextResponse.json({ error: "Error al buscar productos" }, { status: 500 });
    }
    return NextResponse.json({ data: data ?? [], count: null });
  }

  // Search/list mode
  let qb = supabaseAdmin
    .from("products")
    .select("id, sku, plu, name, price, active", includeCount ? { count: "exact" } : undefined)
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (activeParam === "true") qb = qb.eq("active", true);
  else if (activeParam === "false") qb = qb.eq("active", false);
  // "all" → no filter

  if (q) {
    const isNumeric = /^\d+$/.test(q);
    if (isNumeric) {
      // Exact SKU first — return a prioritized set
      const { data: bySku, error: e1 } = await supabaseAdmin
        .from("products")
        .select("id, sku, plu, name, price, active")
        .eq("sku", q)
        .eq("active", activeParam === "false" ? false : true)
        .limit(20);

      if (e1) {
        console.error("products/catalog sku exact error:", e1);
        return NextResponse.json({ error: "Error al buscar productos" }, { status: 500 });
      }

      if (bySku && bySku.length > 0) {
        return NextResponse.json({ data: bySku, count: null });
      }
      // fall through to name search
    }
    qb = qb.ilike("name", `%${q}%`);
  }

  const { data, error, count } = await (qb as any);
  if (error) {
    console.error("products/catalog search error:", error);
    return NextResponse.json({ error: "Error al buscar productos" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [], count: count ?? null });
}
