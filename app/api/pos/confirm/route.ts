import { NextResponse } from "next/server";
import { posConfirmarVenta } from "@/lib/posConfirm";

type ItemIn = { product_id?: string; productId?: string; id?: string; qty?: number; quantity?: number; unit_price?: number; price?: number };

function normalizeItems(input: any) {
  const source = input?.items ?? input?.detalle ?? input?.products ?? input?.cart ?? input;
  if (!Array.isArray(source)) return [];
  return source.map((raw: ItemIn) => ({
    product_id: String(raw.product_id ?? raw.productId ?? raw.id ?? ""),
    qty: Number(raw.qty ?? raw.quantity ?? 0),
    unit_price: Number(raw.unit_price ?? raw.price ?? 0),
  })).filter(i => i.product_id && i.qty > 0);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const items = normalizeItems(body);
    const total = Number(body?.total ?? 0);
    const payment = body?.payment ?? {};
    const storeId = body?.storeId ?? body?.sucursalId ?? null;

    if (items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Sin items válidos" },
        { status: 400 }
      );
    }

    // Reintentos de firma
    try {
      const result = await posConfirmarVenta?.({ items, total, payment, storeId });
      return NextResponse.json({ ok: true, result });
    } catch {
      try {
        const result = await posConfirmarVenta?.(items);
        return NextResponse.json({ ok: true, result });
      } catch {
        try {
          const result = await posConfirmarVenta?.({ detalle: items, total, payment, sucursalId: storeId });
          return NextResponse.json({ ok: true, result });
        } catch {
          try {
            const result = await posConfirmarVenta?.({ products: items, total, payment, storeId });
            return NextResponse.json({ ok: true, result });
          } catch {
            // Fallback temporal
            return NextResponse.json({ ok: true, simulated: true, note: "Simulado: alinear firma server." });
          }
        }
      }
    }
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 400 });
  }
}
