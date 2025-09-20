import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type InItem = {
  product_id?: string;
  productId?: string;
  id?: string;
  sku?: string;
  code?: string;
  barcode?: string;
  product?: { id?: string; sku?: string; code?: string; barcode?: string };

  qty?: number | string;
  quantity?: number | string;
  cantidad?: number | string;
  count?: number | string;
  amount?: number | string;
  q?: number | string;

  unit_price?: number | string;
  price?: number | string;
  unitPrice?: number | string;
  importe?: number | string;
};

function toNum(v: any): number {
  if (v === null || v === undefined) return 0;
  // Acepta "2", "2.0", "2,0"
  const s = String(v).replace(/\./g, "").replace(/,/g, ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function pickFirst<T>(...vals: (T | undefined)[]): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null && (v as any) !== "") return v as T;
  return undefined;
}

function normItems(input: any) {
  const src =
    input?.items ??
    input?.detalle ??
    input?.products ??
    input?.cart ??
    input?.carrito ??
    input;

  if (!Array.isArray(src)) return [];

  return src
    .map((r: InItem) => {
      // product_id candidates
      const pidRaw =
        pickFirst(
          r.product_id,
          r.productId,
          r.id,
          r.sku,
          r.code,
          r.barcode,
          r.product?.id,
          r.product?.sku,
          r.product?.code,
          r.product?.barcode
        ) ?? "";

      const product_id = String(pidRaw).trim();

      // qty candidates
      const qty = toNum(
        pickFirst(
          r.qty,
          r.quantity,
          r.cantidad,
          r.count,
          r.amount,
          r.q,
          (input?.qty as any),         // por si mandan qty fuera del item
          (input?.cantidad as any)     // idem
        )
      );

      // unit_price candidates
      const unit_price = toNum(
        pickFirst(
          r.unit_price,
          r.price,
          r.unitPrice,
          r.importe
        )
      );

      return { product_id, qty, unit_price };
    })
    .filter(i => i.product_id && i.qty > 0);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const items = normItems(body);
    const total = toNum(pickFirst(body?.total, body?.importeTotal, body?.montoTotal, body?.total_venta, 0));
    const payment = body?.payment ?? body?.pago ?? {};
    const storeId =
      body?.storeId ??
      body?.store_id ??
      body?.sucursal_id ??
      body?.store?.id ??
      null;

    if (items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Sin items válidos (faltan product_id/sku o qty)." },
        { status: 400 }
      );
    }

    // Llamada transaccional en Supabase
    const { data, error } = await supabaseAdmin.rpc("confirm_sale", {
      p_store_id: storeId,
      p_items: items,
      p_total: total,
      p_payment: payment,
    });

    if (error) {
      console.error("confirm_sale error:", error, "payload:", { items, total, payment, storeId });
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, sale_id: (data as any)?.sale_id ?? data });
  } catch (e: any) {
    console.error("confirm_sale catch:", e?.message ?? e, e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 400 });
  }
}
