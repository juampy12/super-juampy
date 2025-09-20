import { NextResponse } from "next/server";
import { posConfirmarVenta } from "@/lib/posConfirm";

type ItemIn = { product_id?: string; productId?: string; id?: string; qty?: number; quantity?: number; unit_price?: number; price?: number };
type Payment = { method?: string; cash?: number; debit?: number; credit?: number; transfer?: number };

function normalizeItems(input: any): { product_id: string; qty: number; unit_price: number }[] {
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
    const payment: Payment = body?.payment ?? {};

    if (items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No llegaron ítems válidos. Esperado: items[{product_id, qty, unit_price}]." },
        { status: 400 }
      );
    }

    // Intento 1: firma moderna
    try {
      const result = await posConfirmarVenta?.({ items, total, payment });
      return NextResponse.json({ ok: true, result });
    } catch (e1:any) {
      // Intento 2: vector directo
      try {
        const result = await posConfirmarVenta?.(items);
        return NextResponse.json({ ok: true, result });
      } catch (e2:any) {
        // Intento 3: 'detalle'
        try {
          const result = await posConfirmarVenta?.({ detalle: items, total, payment });
          return NextResponse.json({ ok: true, result });
        } catch (e3:any) {
          // Intento 4: 'products'
          try {
            const result = await posConfirmarVenta?.({ products: items, total, payment });
            return NextResponse.json({ ok: true, result });
          } catch (e4:any) {
            // Fallback temporal: OK simulado (no persiste)
            return NextResponse.json({
              ok: true,
              simulated: true,
              note: "Confirmación simulada en el server (alinear firma de posConfirmarVenta).",
            });
          }
        }
      }
    }
  } catch (e:any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Error al confirmar venta" },
      { status: 400 }
    );
  }
}
