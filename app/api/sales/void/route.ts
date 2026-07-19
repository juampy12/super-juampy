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
      .select("id, status, store_id, register_id, total, payment, loyalty_customer_id")
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

    // ── 5. Anular de forma atómica (stock + movimiento + status) ──
    const { data: voidedAt, error: voidErr } = await supabaseAdmin.rpc("void_sale_atomic", {
      p_sale_id: saleId,
      p_reason: reason,
      p_void_authorized_by: supervisor.employee_id,
      p_void_authorized_code: supervisorCode,
      p_void_authorized_name: supervisor.name ?? null,
      p_voided_by: session.employee_id,
      p_voided_by_role: session.role,
      p_voided_from_store_id: session.store_id ?? null,
      p_voided_from_register_id: session.register_id ?? null,
    });

    if (voidErr) {
      console.error("Error en void_sale_atomic:", voidErr);
      if (voidErr.message?.includes("sale_already_voided")) {
        return NextResponse.json({ ok: false, error: "La venta ya está anulada" }, { status: 409 });
      }
      if (voidErr.message?.includes("sale_not_confirmed")) {
        return NextResponse.json({ ok: false, error: "Solo se pueden anular ventas confirmadas" }, { status: 409 });
      }
      if (voidErr.message?.includes("sale_not_found")) {
        return NextResponse.json({ ok: false, error: "Venta no encontrada" }, { status: 404 });
      }
      return NextResponse.json({ ok: false, error: "Error al procesar la operación" }, { status: 500 });
    }

    // Fidelización: revierte los puntos acumulados por esta venta, si tenía cliente.
    // Nunca hace fallar la anulación — la venta ya quedó anulada arriba.
    if (sale.loyalty_customer_id) {
      try {
        const { data: reversal, error: reversalErr } = await supabaseAdmin.rpc(
          "anular_fidelizacion",
          { p_sale_id: saleId, p_employee_id: session.employee_id ?? null }
        );
        if (reversalErr) {
          console.error("Error en anular_fidelizacion:", reversalErr);
        } else if (!reversal?.ok) {
          console.error("anular_fidelizacion no revirtió puntos:", reversal?.motivo ?? reversal);
        }
      } catch (loyaltyEx) {
        console.error("Error inesperado revirtiendo fidelización:", loyaltyEx);
      }
    }

    return NextResponse.json({ ok: true, voided_at: voidedAt });
  } catch (e: any) {
    console.error("Error inesperado en /api/sales/void:", e);
    return NextResponse.json({ ok: false, error: "Error inesperado" }, { status: 500 });
  }
}
