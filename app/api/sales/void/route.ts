import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, unauthorized, isSupervisor, forbidden } from "@/lib/session";
import { isBlocked, recordFailure, resetFailures } from "@/lib/rateLimiter";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Autenticación y autorización ──────────────────────────
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();

    const ip = getIp(req);
    if (isBlocked(ip)) {
      return NextResponse.json(
        { ok: false, error: "Demasiados intentos fallidos. Intentá en 15 minutos." },
        { status: 429 }
      );
    }

    // ── 2. Parsear y validar body ────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const saleId = String(body.sale_id ?? "").trim();
    const supervisorCode = String(body.supervisor_code ?? body.code ?? "").trim();
    const pin = String(body.pin ?? "").trim();
    const reason = String(body.reason ?? "").trim();

    if (!UUID_RE.test(saleId)) {
      return NextResponse.json({ ok: false, error: "sale_id inválido" }, { status: 400 });
    }
    if (!supervisorCode || !pin) {
      return NextResponse.json({ ok: false, error: "Falta código o PIN de supervisor" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ ok: false, error: "Falta el motivo de anulación" }, { status: 400 });
    }
    if (reason.length > 200) {
      return NextResponse.json({ ok: false, error: "El motivo no puede superar 200 caracteres" }, { status: 400 });
    }

    // ── 3. Validar override de supervisor ────────────────────────
    const { data: supervisorData, error: supervisorErr } = await supabaseAdmin.rpc("verify_employee_pin", {
      p_code: supervisorCode,
      p_pin: pin,
    });

    if (supervisorErr) {
      console.error("Error validando supervisor:", supervisorErr);
      return NextResponse.json({ ok: false, error: "Error al procesar la operación" }, { status: 500 });
    }

    const supervisor = Array.isArray(supervisorData) ? supervisorData[0] : null;
    if (!supervisor?.employee_id || supervisor.role !== "supervisor") {
      const { blocked } = recordFailure(ip);
      if (blocked) {
        return NextResponse.json(
          { ok: false, error: "Demasiados intentos fallidos. Intentá en 15 minutos." },
          { status: 429 }
        );
      }
      return NextResponse.json({ ok: false, error: "Código o PIN de supervisor incorrecto" }, { status: 401 });
    }
    resetFailures(ip);

    // ── 4. Cargar la venta ───────────────────────────────────────
    const { data: sale, error: saleErr } = await supabaseAdmin
      .from("sales")
      .select("id, status, store_id, register_id, total, payment")
      .eq("id", saleId)
      .maybeSingle();

    if (saleErr) {
      console.error("Error leyendo venta:", saleErr);
      return NextResponse.json({ ok: false, error: "Error al procesar la operación" }, { status: 500 });
    }
    if (!sale) {
      return NextResponse.json({ ok: false, error: "Venta no encontrada" }, { status: 404 });
    }
    if (!isSupervisor(session) && sale.store_id !== session.store_id) return forbidden();

    if (sale.status === "anulada") {
      return NextResponse.json({ ok: false, error: "La venta ya está anulada" }, { status: 409 });
    }
    if (sale.status !== "confirmed") {
      return NextResponse.json({ ok: false, error: "Solo se pueden anular ventas confirmadas" }, { status: 409 });
    }

    // ── 5. Cargar items de la venta ──────────────────────────────
    const { data: items, error: itemsErr } = await supabaseAdmin
      .from("sale_items")
      .select("product_id, quantity")
      .eq("sale_id", saleId);

    if (itemsErr) {
      console.error("Error leyendo items de venta:", itemsErr);
      return NextResponse.json({ ok: false, error: "Error al procesar la operación" }, { status: 500 });
    }

    // ── 6. Devolver stock a la sucursal ──────────────────────────
    const storeId = sale.store_id as string | null;
    const validItems = (items ?? []).filter((i: any) => i.product_id && Number(i.quantity) > 0);

    if (storeId && validItems.length > 0) {
      const productIds = validItems.map((i: any) => i.product_id as string);

      // Leer stocks actuales en batch
      const { data: currentStocks, error: stockErr } = await supabaseAdmin
        .from("product_stocks")
        .select("product_id, stock")
        .eq("store_id", storeId)
        .in("product_id", productIds);

      if (stockErr) {
        console.error("Error leyendo stocks:", stockErr);
        return NextResponse.json({ ok: false, error: "Error al procesar la operación" }, { status: 500 });
      }

      const stockMap: Record<string, number> = {};
      for (const row of currentStocks ?? []) {
        stockMap[row.product_id] = Number(row.stock ?? 0);
      }

      const now = new Date().toISOString();

      // Upsert de stocks devueltos
      const { error: upsertErr } = await supabaseAdmin
        .from("product_stocks")
        .upsert(
          validItems.map((item: any) => ({
            store_id: storeId,
            product_id: item.product_id,
            stock: (stockMap[item.product_id] ?? 0) + Number(item.quantity),
          })),
          { onConflict: "store_id,product_id" }
        );

      if (upsertErr) {
        console.error("Error devolviendo stock:", upsertErr);
        return NextResponse.json({ ok: false, error: "Error al procesar la operación" }, { status: 500 });
      }

      // Movimientos de stock: reason = "void_sale"
      const { error: movErr } = await supabaseAdmin
        .from("stock_movements")
        .insert(
          validItems.map((item: any) => ({
            store_id: storeId,
            product_id: item.product_id,
            qty: Number(item.quantity),
            qty_delta: Number(item.quantity),
            delta: Number(item.quantity),
            reason: "void_sale",
            note: `Anulación de venta ${saleId}. Autorizó ${supervisorCode}. Motivo: ${reason}`,
            created_at: now,
          }))
        );

      if (movErr) {
        console.error("Error registrando movimientos:", movErr);
        return NextResponse.json({ ok: false, error: "Error al procesar la operación" }, { status: 500 });
      }
    }

    // ── 7. Marcar la venta como anulada ──────────────────────────
    const voidedAt = new Date().toISOString();
    const updatedPayment = {
      ...(typeof sale.payment === "object" && sale.payment !== null ? sale.payment : {}),
      voided_at: voidedAt,
      voided_by: session.employee_id,
      voided_by_role: session.role,
      voided_from_store_id: session.store_id,
      voided_from_register_id: session.register_id,
      void_authorized_by: supervisor.employee_id,
      void_authorized_code: supervisorCode,
      void_authorized_name: supervisor.name ?? null,
      void_reason: reason,
      void_sale_store_id: sale.store_id,
      void_sale_register_id: sale.register_id,
    };

    const { error: updateErr } = await supabaseAdmin
      .from("sales")
      .update({ status: "anulada", payment: updatedPayment })
      .eq("id", saleId);

    if (updateErr) {
      console.error("Error marcando venta como anulada:", updateErr);
      return NextResponse.json({ ok: false, error: "Error al procesar la operación" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, voided_at: voidedAt });
  } catch (e: any) {
    console.error("Error inesperado en /api/sales/void:", e);
    return NextResponse.json({ ok: false, error: "Error inesperado" }, { status: 500 });
  }
}
