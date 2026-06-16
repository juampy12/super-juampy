import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, unauthorized, isSupervisor } from "@/lib/session";

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
  idempotency_key?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

/** Devuelve null si idempotencyKey no existe en sales; el sale_id si ya fue procesada. */
async function findExistingSale(idempotencyKey: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { data } = await supabaseAdmin
    .from("sales")
    .select("id")
    .contains("payment", { idempotency_key: idempotencyKey })
    .gte("created_at", oneHourAgo)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  try {
    const body = await req.json();

    const bodyStoreId = resolveStoreId(body);
    const register_id = body.register_id ?? body.registerId ?? null;
    // Cajeros no pueden especificar una sucursal distinta a la de su sesión
    const storeId = isSupervisor(session) ? bodyStoreId : (session.store_id ?? null);

    // Validar y extraer la clave de idempotencia enviada por el cliente.
    // Debe ser un UUID válido; se ignora si no cumple el formato.
    const rawKey = body.idempotency_key;
    const idempotencyKey: string | null =
      typeof rawKey === "string" && UUID_RE.test(rawKey) ? rawKey : null;

    if (!storeId) {
      return NextResponse.json({ error: "store_id es obligatorio" }, { status: 400 });
    }
    if (!register_id) {
      return NextResponse.json({ error: "register_id es obligatorio (falta caja)" }, { status: 400 });
    }

    // Dedup: si la misma clave ya existe en una venta reciente, devolver la existente.
    // Cubre tanto reintentos por timeout como la cola offline reenviando la misma venta.
    if (idempotencyKey) {
      const existingSaleId = await findExistingSale(idempotencyKey);
      if (existingSaleId) {
        return NextResponse.json({ ok: true, saleId: existingSaleId });
      }
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
    const nowIso = new Date().toISOString();
    const [{ data: prods, error: prodErr }, { data: offerRows }] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id, price, active")
        .in("id", productIds),
      supabaseAdmin
        .from("product_offers")
        .select("product_id, store_id, type, value")
        .in("product_id", productIds)
        .eq("is_active", true)
        .lte("starts_at", nowIso)
        .gte("ends_at", nowIso)
        .or(`store_id.eq.${storeId},store_id.is.null`),
    ]);

    if (prodErr) {
      console.error("Error leyendo productos en confirm:", prodErr);
      return NextResponse.json({ error: "Error al procesar la venta" }, { status: 500 });
    }

    // Ofertas: store-specific gana sobre global (store_id = null)
    const offerMap = new Map<string, { type: string; value: number; storeSpecific: boolean }>();
    for (const o of offerRows ?? []) {
      const pid = String(o.product_id);
      const storeSpecific = o.store_id === storeId;
      const prev = offerMap.get(pid);
      if (!prev || storeSpecific) offerMap.set(pid, { type: String(o.type), value: toNum(o.value), storeSpecific });
    }

    const effectivePrice = (basePrice: number, pid: string): number => {
      const o = offerMap.get(pid);
      if (!o) return basePrice;
      if (o.type === "fixed_price") return toNum(o.value);
      if (o.type === "percent") return Math.max(0, basePrice * (1 - o.value / 100));
      return basePrice;
    };

    const productMap = new Map<string, { price: number }>();
    for (const p of prods ?? []) {
      if (!p.active) {
        return NextResponse.json(
          { error: "La venta contiene productos inactivos" },
          { status: 400 }
        );
      }
      productMap.set(String(p.id), { price: effectivePrice(toNum(p.price, 0), String(p.id)) });
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

    // Embeber idempotency_key en el JSONB de payment para que quede persistido en sales.
    // La próxima llamada con el mismo key encontrará la venta ya creada sin crear duplicado.
    const paymentWithKey: PaymentInfo | null = payment && idempotencyKey
      ? { ...payment, idempotency_key: idempotencyKey }
      : payment;

    // RPC: confirm_sale_with_stock mete register_id dentro de payment para confirm_sale
    const { data, error } = await supabaseAdmin.rpc("confirm_sale_with_stock", {
      p_store_id: storeId,
      p_items: items,
      p_total: total,
      p_payment: paymentWithKey,
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
