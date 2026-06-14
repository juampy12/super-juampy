import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const query: string | null = body.query ?? null;
  const limit: number = Math.min(Number(body.limit ?? 400), 1000);
  let store_id: string = body.store_id ?? "";

  if (!isSupervisor(session)) {
    if (!session.store_id) return forbidden("Sin sucursal asignada");
    if (store_id && store_id !== session.store_id)
      return forbidden("Sin acceso a esa sucursal");
    store_id = session.store_id;
  }

  if (!store_id) {
    return NextResponse.json({ error: "Falta store_id" }, { status: 400 });
  }

  // Fetch minimums configured for this store
  const { data: minRows, error: minErr } = await supabaseAdmin
    .from("product_min_stock")
    .select("product_id, min_stock")
    .eq("store_id", store_id);

  if (minErr) {
    console.error("stock/low min_stock error:", minErr);
    return NextResponse.json({ error: "Error consultando mínimos" }, { status: 500 });
  }

  if (!minRows || minRows.length === 0) {
    return NextResponse.json([]);
  }

  const productIds = minRows.map((r) => r.product_id as string);

  // Fetch per-store stocks and product info in parallel
  const [stockRes, productRes] = await Promise.all([
    supabaseAdmin
      .from("product_stocks")
      .select("product_id, stock")
      .eq("store_id", store_id)
      .in("product_id", productIds),
    supabaseAdmin
      .from("products")
      .select("id, name, sku, price, active")
      .in("id", productIds)
      .eq("active", true),
  ]);

  if (stockRes.error) {
    console.error("stock/low product_stocks error:", stockRes.error);
    return NextResponse.json({ error: "Error consultando stock" }, { status: 500 });
  }
  if (productRes.error) {
    console.error("stock/low products error:", productRes.error);
    return NextResponse.json({ error: "Error consultando productos" }, { status: 500 });
  }

  const stockMap = new Map<string, number>(
    (stockRes.data ?? []).map((s) => [s.product_id as string, Number(s.stock ?? 0)])
  );
  const productMap = new Map(
    (productRes.data ?? []).map((p) => [p.id as string, p])
  );

  const lowerQuery = query ? query.toLowerCase() : null;

  const rows = minRows
    .filter((m) => productMap.has(m.product_id as string))
    .map((m) => {
      const p = productMap.get(m.product_id as string)!;
      const stock = stockMap.get(m.product_id as string) ?? 0;
      const min_stock = Number(m.min_stock ?? 0);
      const missing = Math.max(min_stock - stock, 0);
      return {
        id: p.id as string,
        name: p.name as string,
        sku: (p.sku ?? null) as string | null,
        price: p.price != null ? Number(p.price) : null,
        stock,
        min_stock,
        missing,
      };
    })
    .filter((r) => {
      if (!lowerQuery) return true;
      return (
        r.name.toLowerCase().includes(lowerQuery) ||
        (r.sku ?? "").toLowerCase().includes(lowerQuery)
      );
    })
    .sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name))
    .slice(0, limit);

  return NextResponse.json(rows);
}
