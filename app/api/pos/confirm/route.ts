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
        quantity: resolveQty(it),
        // unit_price del cliente se ignora — se sobreescribe con el precio de la DB
        unit_price: 0,
      }))
      .filter((it) => it.product_id && it.quantity > 0) as Array<{
      product_id: string;
      quantity: number;
      unit_price: number;
    }>;

    if (!items.length) {
      return NextResponse.json({ error: "No hay ítems válidos para registrar la venta" }, { status: 400 });
    }

    // ✅ Siempre consultar precios y estado de la DB — nunca confiar en el cliente
    const productIds = Array.from(new Set(items.map((x) => x.product_id)));
    const { data: prods, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("id, price, active")
      .in("id", productIds);

    if (prodErr) {
      console.error("Error leyendo productos en confirm:", prodErr);
      return NextResponse.json({ error: "Error al procesar la venta" }, { status: 500 });
    }

    const productMap = new Map<string, { price: number }>();
    for (const p of prods ?? []) {
      if (!p.active) {
        return NextResponse.json(
          { error: "La venta contiene productos inactivos" },
          { status: 400 }
        );
      }
      productMap.set(String(p.id), { price: toNum(p.price, 0) });
    }

    for (const item of items) {
      if (!productMap.has(item.product_id)) {
        return NextResponse.json(
          { error: "La venta contiene productos no encontrados" },
          { status: 400 }
        );
      }
    }

    // Reemplazar precios con los valores reales de la DB
    items = items.map((it) => ({
      ...it,
      unit_price: productMap.get(it.product_id)!.price,
    }));

    // Total siempre calculado desde precios de DB (no se acepta del cliente)
    const total = items.reduce((acc, it) => acc + it.quantity * it.unit_price, 0);

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
      return NextResponse.json({ error: "Error al registrar la venta" }, { status: 500 });
    }

    const saleId = data as string | null;

    // seguridad extra: si por algún motivo no se guardó register_id en sales, lo aseguramos
    if (saleId && register_id) {
      await supabaseAdmin.from("sales").update({ register_id }).eq("id", saleId);
    }

    return NextResponse.json({ ok: true, saleId });
  } catch (e: any) {
    console.error("Error inesperado en /api/pos/confirm:", e);
    return NextResponse.json({ error: "Error inesperado al registrar la venta" }, { status: 500 });
  }
}
