import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  forbidCashierRegisterMismatch,
  getSessionFromRequest,
  isSupervisor,
  unauthorized,
} from "@/lib/session";

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

  source?: string;
  line_type?: string;
  is_balanza?: boolean;
  isScaleBarcode?: boolean;
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
  total_paid: number;
  change: number;
  breakdown: PaymentBreakdown;
  notes?: string;
  idempotency_key?: string;
  // Faltante tolerado en resync offline (oferta vencida u otro cambio de
  // precio entre la venta y la sincronización). Ausente en ventas normales.
  shortfall?: number;
  sync_note?: string;
};

// Tope de faltante tolerado al re-sincronizar una venta offline: si el precio
// vigente subió más de esto respecto de lo que el cliente cobró en el local,
// se rechaza igual (no se acepta cualquier diferencia sin límite).
const OFFLINE_SHORTFALL_CAP_PCT = 0.10;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toNum = (v: any, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const resolveProductId = (item: InItem): string | null =>
  item.product_id || item.productId || item.id || item.product?.id || null;

const resolveQty = (item: InItem): number =>
  toNum(item.qty ?? item.quantity ?? item.cantidad ?? item.count ?? item.amount ?? item.q ?? 0);

const resolveClientUnitPrice = (item: InItem): number =>
  toNum(item.unit_price ?? item.unitPrice ?? item.price ?? item.importe ?? 0, 0);

const isScaleBarcodeItem = (item: InItem): boolean =>
  item.source === "scale_barcode" || item.line_type === "scale_barcode" || item.is_balanza === true || item.isScaleBarcode === true;

const resolveStoreId = (body: any): string | null =>
  body.store_id ?? body.storeId ?? body.branch_id ?? body.sucursal_id ?? null;

const PAYMENT_METHODS = new Set<PaymentMethod>([
  "efectivo",
  "debito",
  "credito",
  "mp",
  "cuenta_corriente",
  "mixto",
]);

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function paymentError(message: string) {
  return { ok: false as const, message };
}

function paymentOk(payment: PaymentInfo) {
  return { ok: true as const, payment };
}

function validateAndNormalizePayment(
  p: any,
  totalRaw: number,
  opts?: { allowShortfall?: boolean }
) {
  if (!p) return paymentError("Falta información de pago");

  const method: PaymentMethod = String(p.method ?? "") as PaymentMethod;
  if (!PAYMENT_METHODS.has(method)) {
    return paymentError("Método de pago inválido");
  }

  const total = roundMoney(totalRaw);
  const total_paid = toNum(p.total_paid ?? p.totalPaid ?? 0, 0);
  const allowShortfall = Boolean(opts?.allowShortfall);
  const shortfallCap = roundMoney(total * OFFLINE_SHORTFALL_CAP_PCT);

  // Aceptamos breakdown viejo con "account" y lo pasamos a "cuenta_corriente"
  const raw = (p.breakdown ?? {}) as any;

  const rawBreakdown: Required<PaymentBreakdown> = {
    cash: roundMoney(toNum(raw.cash ?? 0, 0)),
    debit: roundMoney(toNum(raw.debit ?? 0, 0)),
    credit: roundMoney(toNum(raw.credit ?? 0, 0)),
    mp: roundMoney(toNum(raw.mp ?? 0, 0)),
    cuenta_corriente: roundMoney(toNum(raw.cuenta_corriente ?? raw.account ?? 0, 0)),
  };

  if (Object.values(rawBreakdown).some((v) => v < 0) || total_paid < 0) {
    return paymentError("Los montos de pago no pueden ser negativos");
  }

  const notes = p.notes ? String(p.notes) : undefined;

  if (method !== "mixto") {
    const clean: PaymentBreakdown = {};

    if (method === "efectivo") {
      const cash = roundMoney(rawBreakdown.cash || total_paid);
      const missing = roundMoney(total - cash);
      if (missing > 0.009) {
        if (!allowShortfall || missing > shortfallCap + 0.005) {
          return paymentError("El pago no cubre el total de la venta");
        }
        clean.cash = cash;
        return paymentOk({ method, total_paid: cash, change: 0, breakdown: clean, notes, shortfall: missing });
      }
      const change = roundMoney(cash - total);
      clean.cash = cash;
      return paymentOk({ method, total_paid: cash, change, breakdown: clean, notes });
    }

    const amount =
      method === "debito"
        ? rawBreakdown.debit || total_paid
        : method === "credito"
        ? rawBreakdown.credit || total_paid
        : method === "mp"
        ? rawBreakdown.mp || total_paid
        : rawBreakdown.cuenta_corriente || total_paid;

    const normalizedAmount = roundMoney(amount);
    const diff = roundMoney(total - normalizedAmount); // >0 falta, <0 sobra

    if (Math.abs(diff) > 0.01) {
      if (diff > 0) {
        // Falta plata: solo se tolera en resync offline, y hasta el tope.
        if (!allowShortfall || diff > shortfallCap + 0.005) {
          return paymentError("El monto del pago debe coincidir con el total de la venta");
        }
      } else if (!allowShortfall) {
        // Sobra plata: en una venta en vivo esto sigue siendo un dato mal
        // cargado (no hay concepto de "vuelto" en estos métodos). En resync
        // offline puede pasar legítimamente si el precio bajó — se acepta.
        return paymentError("El monto del pago debe coincidir con el total de la venta");
      }

      if (method === "debito") clean.debit = normalizedAmount;
      if (method === "credito") clean.credit = normalizedAmount;
      if (method === "mp") clean.mp = normalizedAmount;
      if (method === "cuenta_corriente") clean.cuenta_corriente = normalizedAmount;

      return paymentOk({
        method,
        total_paid: normalizedAmount,
        change: 0,
        breakdown: clean,
        notes,
        ...(diff > 0 ? { shortfall: diff } : {}),
      });
    }

    if (method === "debito") clean.debit = total;
    if (method === "credito") clean.credit = total;
    if (method === "mp") clean.mp = total;
    if (method === "cuenta_corriente") clean.cuenta_corriente = total;

    return paymentOk({
      method,
      total_paid: total,
      change: 0,
      breakdown: clean,
      notes,
    });
  }

  const breakdownTotal = roundMoney(
    rawBreakdown.cash +
      rawBreakdown.debit +
      rawBreakdown.credit +
      rawBreakdown.mp +
      rawBreakdown.cuenta_corriente
  );

  const missingMixto = roundMoney(total - breakdownTotal);
  let shortfallMixto: number | undefined;

  if (missingMixto > 0.009) {
    if (!allowShortfall || missingMixto > shortfallCap + 0.005) {
      return paymentError("El pago mixto no cubre el total de la venta");
    }
    shortfallMixto = missingMixto;
  }

  const overpay = shortfallMixto ? 0 : roundMoney(breakdownTotal - total);
  if (overpay > 0.01 && rawBreakdown.cash <= 0) {
    return paymentError("Solo puede haber vuelto cuando una parte del pago es efectivo");
  }
  if (overpay - rawBreakdown.cash > 0.01) {
    return paymentError("El vuelto no puede superar el efectivo recibido");
  }

  const clean: PaymentBreakdown = {};
  if (rawBreakdown.cash > 0) clean.cash = rawBreakdown.cash;
  if (rawBreakdown.debit > 0) clean.debit = rawBreakdown.debit;
  if (rawBreakdown.credit > 0) clean.credit = rawBreakdown.credit;
  if (rawBreakdown.mp > 0) clean.mp = rawBreakdown.mp;
  if (rawBreakdown.cuenta_corriente > 0) clean.cuenta_corriente = rawBreakdown.cuenta_corriente;

  return paymentOk({
    method,
    total_paid: breakdownTotal,
    change: overpay,
    breakdown: clean,
    notes,
    ...(shortfallMixto ? { shortfall: shortfallMixto } : {}),
  });
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
    const bodyRegisterId = body.register_id ?? body.registerId ?? null;
    const register_id = isSupervisor(session) ? bodyRegisterId : (session.register_id ?? null);
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
    const registerMismatch = forbidCashierRegisterMismatch(session, bodyRegisterId);
    if (registerMismatch) return registerMismatch;
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
        client_unit_price: resolveClientUnitPrice(it),
        source: isScaleBarcodeItem(it) ? "scale_barcode" : null,
      }))
      .filter((it) => it.product_id && it.quantity > 0) as Array<{
      product_id: string;
      quantity: number;
      unit_price: number;
      client_unit_price: number;
      source: "scale_barcode" | null;
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
        .select("id, price, active, is_weighted")
        .in("id", productIds),
      supabaseAdmin
        .from("product_offers")
        .select("product_id, store_id, type, value, qty_buy, qty_pay")
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
    type OfferInfo = {
      type: string;
      value: number;
      qty_buy: number | null;
      qty_pay: number | null;
      storeSpecific: boolean;
    };
    const offerMap = new Map<string, OfferInfo>();
    for (const o of offerRows ?? []) {
      const pid = String(o.product_id);
      const storeSpecific = o.store_id === storeId;
      const prev = offerMap.get(pid);
      if (!prev || storeSpecific) {
        offerMap.set(pid, {
          type: String(o.type),
          value: toNum(o.value),
          qty_buy: o.qty_buy != null ? toNum(o.qty_buy) : null,
          qty_pay: o.qty_pay != null ? toNum(o.qty_pay) : null,
          storeSpecific,
        });
      }
    }

    const effectivePrice = (basePrice: number, pid: string): number => {
      const o = offerMap.get(pid);
      if (!o) return basePrice;
      if (o.type === "fixed_price") return toNum(o.value);
      if (o.type === "percent") return Math.max(0, basePrice * (1 - o.value / 100));
      return basePrice;
    };

    const productMap = new Map<string, { price: number; is_weighted: boolean }>();
    for (const p of prods ?? []) {
      if (!p.active) {
        return NextResponse.json(
          { error: "La venta contiene productos inactivos" },
          { status: 400 }
        );
      }
      productMap.set(String(p.id), {
        price: effectivePrice(toNum(p.price, 0), String(p.id)),
        is_weighted: Boolean(p.is_weighted),
      });
    }

    for (const item of items) {
      if (!productMap.has(item.product_id)) {
        return NextResponse.json(
          { error: "La venta contiene productos no encontrados" },
          { status: 400 }
        );
      }
    }

    const finalItems: Array<{
      product_id: string;
      quantity: number;
      unit_price: number;
      source?: "scale_barcode";
    }> = [];

    // Acumulador del total esperado, SOLO para validar el pago acá — no es lo
    // que se manda a la RPC. La RPC es la única que aplica la matemática de
    // nxm/second_unit_pct; acá se replica la misma fórmula únicamente para
    // saber cuánto debería cobrarse y así comparar contra total_paid.
    let expectedTotal = 0;

    // Ítems de balanza: precio individual por escaneo, nunca se agrupan ni llevan nxm.
    for (const it of items) {
      if (it.source !== "scale_barcode") continue;
      const product = productMap.get(it.product_id)!;

      if (!product.is_weighted) {
        return NextResponse.json(
          { error: "El precio de balanza solo se acepta para productos pesables" },
          { status: 400 }
        );
      }
      if (it.client_unit_price <= 0 || it.client_unit_price > 10_000_000) {
        return NextResponse.json(
          { error: "Precio de balanza inválido" },
          { status: 400 }
        );
      }

      finalItems.push({
        product_id: it.product_id,
        quantity: 1,
        unit_price: it.client_unit_price,
        source: "scale_barcode",
      });
      expectedTotal += roundMoney(it.client_unit_price);
    }

    // Resto de los ítems: se agrupan por product_id (mismo hardening que la RPC
    // confirm_sale_with_stock) solo para calcular el total esperado — el
    // unit_price que se manda a la RPC es siempre el de LISTA (o el ya resuelto
    // por percent/fixed_price); la RPC es quien aplica el blended de nxm/second_unit_pct.
    const groupedQty = new Map<string, number>();
    for (const it of items) {
      if (it.source === "scale_barcode") continue;
      groupedQty.set(it.product_id, (groupedQty.get(it.product_id) ?? 0) + it.quantity);
    }

    for (const [product_id, quantity] of groupedQty) {
      const product = productMap.get(product_id)!;
      const offer = offerMap.get(product_id);

      const listPrice = product.price;
      let blendedPrice = listPrice;

      // Misma fórmula que confirm_sale_with_stock: unidades facturadas → blended
      // redondeado a 2 decimales. Se usa SOLO para expectedTotal (validación de
      // pago), nunca para el unit_price que viaja en finalItems.
      if (offer && offer.type === "nxm" && offer.qty_buy && offer.qty_pay) {
        const fullGroups = Math.floor(quantity / offer.qty_buy);
        const remainder = quantity - fullGroups * offer.qty_buy;
        const billedUnits = fullGroups * offer.qty_pay + remainder;
        blendedPrice = roundMoney((billedUnits * listPrice) / quantity);
      } else if (offer && offer.type === "second_unit_pct" && offer.value > 0) {
        const fullGroups = Math.floor(quantity / 2);
        const remainder = quantity - fullGroups * 2;
        const billedUnits = fullGroups * (2 - offer.value / 100) + remainder;
        blendedPrice = roundMoney((billedUnits * listPrice) / quantity);
      }

      finalItems.push({ product_id, quantity, unit_price: listPrice });
      expectedTotal += roundMoney(quantity * blendedPrice);
    }

    // Total esperado, solo para validar el pago — la RPC calcula y graba el
    // suyo propio a partir de sus propias líneas (fuente de verdad única).
    const total = roundMoney(expectedTotal);

    if (total <= 0) {
      return NextResponse.json(
        { error: "No se puede confirmar una venta sin importe. Revisá que todos los productos tengan precio." },
        { status: 400 }
      );
    }

    // Ventas reencoladas desde lib/offlineQueue.ts: el precio pudo cambiar
    // (oferta vencida, etc.) entre que se cobró en el local y este resync.
    // Se tolera un faltante hasta el tope — nunca en una confirmación en vivo.
    const offlineResync = body.offline_resync === true;

    const paymentResult = validateAndNormalizePayment(body.payment, total, {
      allowShortfall: offlineResync,
    });
    if (!paymentResult.ok) {
      return NextResponse.json({ error: paymentResult.message }, { status: 400 });
    }
    const payment = paymentResult.payment;

    // Embeber idempotency_key en el JSONB de payment para que quede persistido en sales.
    // La próxima llamada con el mismo key encontrará la venta ya creada sin crear duplicado.
    const paymentWithKey: PaymentInfo | null = payment
      ? {
          ...payment,
          ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
          ...(offlineResync && payment.shortfall
            ? {
                sync_note:
                  "Precio recalculado al sincronizar (oferta vencida u otro cambio de precio): falta " +
                  payment.shortfall.toFixed(2),
              }
            : {}),
        }
      : payment;

    // RPC: confirm_sale_with_stock mete register_id dentro de payment para confirm_sale
    const { data, error } = await supabaseAdmin.rpc("confirm_sale_with_stock", {
      p_store_id: storeId,
      p_items: finalItems,
      p_total: total,
      p_payment: paymentWithKey,
      p_register_id: register_id,
    });

    if (error) {
      // El índice único uq_sales_idempotency_key protege contra dos inserts
      // concurrentes con la misma idempotency_key (ver findExistingSale arriba,
      // que es check-then-act y no alcanza a cubrir la ventana de carrera).
      // Si la RPC choca contra ese índice, tratamos el 23505 como el mismo
      // camino de dedup: la venta ya existe, se devuelve esa.
      if (error.code === "23505" && idempotencyKey) {
        const existingSaleId = await findExistingSale(idempotencyKey);
        if (existingSaleId) {
          return NextResponse.json({ ok: true, saleId: existingSaleId });
        }
      }
      console.error("Error en confirm_sale_with_stock:", error);
      return NextResponse.json({ error: "Error al registrar la venta" }, { status: 500 });
    }

    const saleId = data as string | null;

    // seguridad extra: si por algún motivo no se guardó register_id en sales, lo aseguramos
    if (saleId && register_id) {
      await supabaseAdmin.from("sales").update({ register_id }).eq("id", saleId);
    }

    // Fidelización (Fase 1 — solo acumulación): opcional, nunca hace fallar la venta.
    // La venta ya está confirmada en este punto; un error acá se loguea y se sigue.
    let loyalty: { puntos_ganados: number; saldo: number; vence: string | null } | null = null;
    const rawLoyaltyCustomerId = body.loyalty_customer_id ?? body.loyaltyCustomerId ?? null;
    const loyaltyCustomerId: string | null =
      typeof rawLoyaltyCustomerId === "string" && UUID_RE.test(rawLoyaltyCustomerId)
        ? rawLoyaltyCustomerId
        : null;

    if (saleId && loyaltyCustomerId) {
      try {
        // El id llega bien formado (UUID) pero puede no existir o corresponder
        // a un cliente dado de baja — se revalida contra la tabla antes de
        // vincular, en vez de confiar ciegamente en lo que mandó el cliente.
        const { data: loyaltyCustomer, error: loyaltyLookupErr } = await supabaseAdmin
          .from("loyalty_customers")
          .select("id")
          .eq("id", loyaltyCustomerId)
          .eq("active", true)
          .maybeSingle();

        if (loyaltyLookupErr) {
          console.error("Error verificando cliente de fidelización:", loyaltyLookupErr);
        } else if (!loyaltyCustomer) {
          console.error(
            "acumular_puntos omitido: loyalty_customer_id no existe o está inactivo:",
            loyaltyCustomerId
          );
        } else {
          const { error: loyaltyLinkErr } = await supabaseAdmin
            .from("sales")
            .update({ loyalty_customer_id: loyaltyCustomerId })
            .eq("id", saleId);
          if (loyaltyLinkErr) {
            console.error("Error vinculando cliente de fidelización a la venta:", loyaltyLinkErr);
          } else {
            const { data: accrual, error: accrualErr } = await supabaseAdmin.rpc("acumular_puntos", {
              p_sale_id: saleId,
            });
            if (accrualErr) {
              console.error("Error en acumular_puntos:", accrualErr);
            } else if (!accrual?.ok) {
              console.error("acumular_puntos no acumuló puntos:", accrual?.motivo ?? accrual);
            } else {
              loyalty = {
                puntos_ganados: accrual.puntos_ganados,
                saldo: accrual.saldo,
                vence: accrual.vence ?? null,
              };
            }
          }
        }
      } catch (loyaltyEx) {
        console.error("Error inesperado procesando fidelización:", loyaltyEx);
      }
    }

    return NextResponse.json({ ok: true, saleId, loyalty });
  } catch (e: any) {
    console.error("Error inesperado en /api/pos/confirm:", e);
    return NextResponse.json({ error: "Error inesperado al registrar la venta" }, { status: 500 });
  }
}
