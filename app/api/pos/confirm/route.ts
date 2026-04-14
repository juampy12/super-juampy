import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type InItem = {
  product_id?: string;
  productId?: string;
  id?: string;
  product?: { id?: string };

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

type PaymentMethod =
  | "efectivo"
  | "debito"
  | "credito"
  | "mp"
  | "cuenta_corriente"
  | "mixto";

type PaymentBreakdown = {
  cash?: number;
  debit?: number;
  credit?: number;
  mp?: number;
  cuenta_corriente?: number;
};

type PaymentInfo = {
  method: PaymentMethod;
  total_paid?: number;
  change?: number;
  breakdown?: PaymentBreakdown;
  notes?: string;
};

const toNum = (v: any, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const resolveProductId = (item: InItem): string | null =>
  item.product_id || item.productId || item.id || item.product?.id || null;

const resolveQty = (item: InItem): number =>
  toNum(item.qty ?? item.quantity ?? item.cantidad ?? item.count ?? item.amount ?? item.q ?? 0);

const resolveUnitPrice = (item: InItem): number =>
  toNum(item.unit_price ?? item.price ?? item.unitPrice ?? item.importe ?? 0);

const resolveStoreId = (body: any): string | null =>
  body.store_id ?? body.storeId ?? body.branch_id ?? body.sucursal_id ?? null;

function normalizePayment(p: any): PaymentInfo | null {
  if (!p) return null;

  const method: PaymentMethod = String(p.method ?? "") as PaymentMethod;
  const total_paid = toNum(p.total_paid ?? p.totalPaid ?? 0, 0);
  const change = toNum(p.change ?? 0, 0);

  // Aceptamos breakdown viejo con "account" y lo pasamos a "cuenta_corriente"
  const raw = (p.breakdown ?? {}) as any;

  const breakdown: PaymentBreakdown = {
    cash: toNum(raw.cash ?? 0, 0),
    debit: toNum(raw.debit ?? 0, 0),
    credit: toNum(raw.credit ?? 0, 0),
    mp: toNum(raw.mp ?? 0, 0),
    cuenta_corriente: toNum(raw.cuenta_corriente ?? raw.account ?? 0, 0),
  };

  // 🔒 Sanitizar breakdown para que NO ensucie reportes:
  // - Si NO es mixto, dejamos SOLO el método correspondiente.
  if (method !== "mixto") {
    const clean: PaymentBreakdown = {};
    if (method === "efectivo") clean.cash = breakdown.cash || total_paid;
    if (method === "debito") clean.debit = breakdown.debit || total_paid;
    if (method === "credito") clean.credit = breakdown.credit || total_paid;
    if (method === "mp") clean.mp = breakdown.mp || total_paid;
    if (method === "cuenta_corriente") clean.cuenta_corriente = breakdown.cuenta_corriente || total_paid;

    return {
      method,
      total_paid,
      change,
      breakdown: clean,
      notes: p.notes ? String(p.notes) : undefined,
    };
  }

  // Mixto: dejamos todo lo que venga, pero numérico y normalizado
  return {
    method,
    total_paid,
    change,
    breakdown,
    notes: p.notes ? String(p.notes) : undefined,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const storeId = resolveStoreId(body);
    const register_id = body.register_id ?? body.registerId ?? null;

    if (!storeId) {
      return NextResponse.json({ error: "store_id es obligatorio" }, { status: 400 });
    }
    if (!register_id) {
      return NextResponse.json({ error: "register_id es obligatorio (falta caja)" }, { status: 400 });
    }

    const rawItems: InItem[] = Array.isArray(body.items) ? body.items : [];
    let items = rawItems
      .map((it) => ({
        product_id: resolveProductId(it),
        qty: resolveQty(it),
        unit_price: resolveUnitPrice(it),
      }))
      .filter((it) => it.product_id && it.qty > 0) as Array<{
      product_id: string;
      qty: number;
      unit_price: number;
    }>;

    if (!items.length) {
      return NextResponse.json({ error: "No hay ítems válidos para registrar la venta" }, { status: 400 });
    }

    // ✅ Fallback: si algún unit_price vino 0, lo tomamos de products.price
    const needsPrice = items.some((it) => !(it.unit_price > 0));
    if (needsPrice) {
      const ids = Array.from(new Set(items.map((x) => x.product_id)));
      const { data: prods, error: perr } = await supabaseAdmin
        .from("products")
        .select("id,price")
        .in("id", ids);

      if (perr) {
        return NextResponse.json({ error: "No pude leer precios de productos", details: perr.message }, { status: 400 });
      }

      const map = new Map<string, number>();
      (prods ?? []).forEach((p: any) => map.set(String(p.id), toNum(p.price ?? 0, 0)));

      items = items.map((it) => {
        if (it.unit_price > 0) return it;
        const fallback = map.get(it.product_id) ?? 0;
        return { ...it, unit_price: fallback };
      });
    }

    // Total: si viene 0 / inválido, calculamos desde items
    const totalFromBody = toNum(body.total ?? 0, 0);
    const calcTotal = items.reduce((acc, it) => acc + it.qty * it.unit_price, 0);
    const total = totalFromBody > 0 ? totalFromBody : calcTotal;

    const payment = normalizePayment(body.payment);

    // RPC: confirm_sale_with_stock mete register_id dentro de payment para confirm_sale
    const { data, error } = await supabaseAdmin.rpc("confirm_sale_with_stock", {
      p_store_id: storeId,
      p_items: items,
      p_total: total,
      p_payment: payment,
      p_register_id: register_id,
    });

    if (error) {
      console.error("Error en confirm_sale_with_stock:", error);
      return NextResponse.json(
        { error: "Error al registrar la venta", details: error.message },
        { status: 400 }
      );
    }

    const saleId = data as string | null;

    // seguridad extra: si por algún motivo no se guardó register_id en sales, lo aseguramos
    if (saleId && register_id) {
      await supabaseAdmin.from("sales").update({ register_id }).eq("id", saleId);
    }

    return NextResponse.json({ ok: true, saleId });
  } catch (e: any) {
    console.error("Error inesperado en /api/pos/confirm:", e);
    return NextResponse.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}
