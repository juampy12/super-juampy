import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseAuditNotes } from "@/lib/auditNotes";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_RE.test(value);
}

function argentinaDayToUtcRange(dateParam: string) {
  const startUtcIso = `${dateParam}T03:00:00.000Z`;
  const d = new Date(`${dateParam}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const nextDay = d.toISOString().slice(0, 10);
  const endUtcIso = `${nextDay}T03:00:00.000Z`;
  return { startUtcIso, endUtcIso };
}

function todayArgentina() {
  return new Date()
    .toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
    .split("/")
    .reverse()
    .map((part) => part.padStart(2, "0"))
    .join("-");
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getPayment(row: { payment: unknown }) {
  return typeof row.payment === "object" && row.payment !== null
    ? row.payment as Record<string, unknown>
    : {};
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();
    if (!isSupervisor(session)) return forbidden("Solo supervisores pueden ver auditoría de operaciones");

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("store_id")?.trim() || null;
    const registerId = searchParams.get("register_id")?.trim() || null;
    const type = searchParams.get("type")?.trim() || "all";
    const from = searchParams.get("from")?.trim() || addDays(todayArgentina(), -6);
    const to = searchParams.get("to")?.trim() || todayArgentina();

    if (storeId && !isUuid(storeId)) {
      return NextResponse.json({ error: "store_id inválido" }, { status: 400 });
    }
    if (registerId && !isUuid(registerId)) {
      return NextResponse.json({ error: "register_id inválido" }, { status: 400 });
    }
    if (!isDate(from) || !isDate(to)) {
      return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
    }
    if (!["all", "voids", "closures"].includes(type)) {
      return NextResponse.json({ error: "type inválido" }, { status: 400 });
    }

    const includeVoids = type === "all" || type === "voids";
    const includeClosures = type === "all" || type === "closures";
    const { startUtcIso } = argentinaDayToUtcRange(from);
    const { endUtcIso } = argentinaDayToUtcRange(to);

    const [voidsResult, closuresResult] = await Promise.all([
      includeVoids
        ? (() => {
            let q = supabaseAdmin
              .from("sales")
              .select("id, created_at, total, store_id, register_id, payment, status")
              .eq("status", "anulada")
              .gte("created_at", startUtcIso)
              .lt("created_at", endUtcIso)
              .order("created_at", { ascending: false })
              .limit(500);
            if (storeId) q = q.eq("store_id", storeId);
            if (registerId) q = q.eq("register_id", registerId);
            return q;
          })()
        : Promise.resolve({ data: [], error: null }),
      includeClosures
        ? (() => {
            let q = supabaseAdmin
              .from("cash_closures")
              .select("id, date, store_id, register_id, total_sales, total_cash, total_tickets, closed_at, notes")
              .gte("date", from)
              .lte("date", to)
              .order("date", { ascending: false })
              .limit(500);
            if (storeId) q = q.eq("store_id", storeId);
            if (registerId) q = q.eq("register_id", registerId);
            return q;
          })()
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (voidsResult.error) {
      console.error("Error leyendo anulaciones para auditoría:", voidsResult.error);
      return NextResponse.json({ error: "Error al procesar anulaciones" }, { status: 500 });
    }
    if (closuresResult.error) {
      console.error("Error leyendo cierres para auditoría:", closuresResult.error);
      return NextResponse.json({ error: "Error al procesar cierres" }, { status: 500 });
    }

    const voids = (voidsResult.data ?? []).map((sale: any) => {
      const payment = getPayment(sale);
      return {
        id: `void:${sale.id}`,
        type: "void",
        sale_id: sale.id,
        at: stringOrNull(payment.voided_at) ?? sale.created_at,
        sale_created_at: sale.created_at,
        store_id: sale.store_id,
        register_id: sale.register_id,
        total: numberValue(sale.total),
        cashier_id: stringOrNull(payment.voided_by),
        cashier_role: stringOrNull(payment.voided_by_role),
        supervisor_id: stringOrNull(payment.void_authorized_by),
        supervisor_code: stringOrNull(payment.void_authorized_code),
        supervisor_name: stringOrNull(payment.void_authorized_name),
        reason: stringOrNull(payment.void_reason),
        from_store_id: stringOrNull(payment.voided_from_store_id),
        from_register_id: stringOrNull(payment.voided_from_register_id),
      };
    });

    const closureOperations = (closuresResult.data ?? []).flatMap((closure: any) => {
      const parsed = parseAuditNotes(closure.notes);
      return parsed.entries.map((entry, index) => ({
        id: `closure:${closure.id}:${index}`,
        type: entry.action.toLowerCase().includes("reemplazo") ? "closure_replace" : "closure_create",
        closure_id: closure.id,
        at: entry.at ?? closure.closed_at ?? `${closure.date}T03:00:00.000Z`,
        date: closure.date,
        store_id: closure.store_id,
        register_id: closure.register_id,
        total: numberValue(closure.total_sales),
        total_cash: numberValue(closure.total_cash),
        tickets: Number(closure.total_tickets ?? 0),
        actor_id: entry.by ?? null,
        actor_role: entry.role ?? null,
        from_store_id: entry.store ?? null,
        from_register_id: entry.register ?? null,
        reason: entry.reason ?? null,
        legacy_notes: parsed.legacy,
      }));
    });

    const operations = [...voids, ...closureOperations]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 700);

    const voidTotal = voids.reduce((acc, op) => acc + op.total, 0);
    const replacements = closureOperations.filter((op) => op.type === "closure_replace");
    const highValueVoids = voids.filter((op) => op.total >= 10000);
    const crossRegisterVoids = voids.filter(
      (op) => op.from_register_id && op.register_id && op.from_register_id !== op.register_id
    );
    const repeatedClosureReplacements = replacements.reduce<Record<string, number>>((acc, op) => {
      const key = `${op.date ?? ""}:${op.store_id ?? ""}:${op.register_id ?? ""}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const alerts = [
      ...highValueVoids.map((op) => ({
        severity: "medium",
        title: "Anulación de monto alto",
        message: `Venta anulada por $${op.total.toLocaleString("es-AR")}`,
        operation_id: op.id,
      })),
      ...crossRegisterVoids.map((op) => ({
        severity: "medium",
        title: "Anulación desde otra caja",
        message: "La caja que anuló no coincide con la caja original de la venta.",
        operation_id: op.id,
      })),
      ...Object.entries(repeatedClosureReplacements)
        .filter(([, count]) => count > 1)
        .map(([key, count]) => ({
          severity: "low",
          title: "Cierre reemplazado varias veces",
          message: `${count} reemplazos registrados para ${key.split(":")[0]}`,
          operation_id: null,
        })),
    ].slice(0, 80);

    return NextResponse.json({
      operations,
      alerts,
      kpis: {
        voids: voids.length,
        void_total: voidTotal,
        closure_creates: closureOperations.filter((op) => op.type === "closure_create").length,
        closure_replacements: replacements.length,
        alerts: alerts.length,
      },
    });
  } catch (e) {
    console.error("Error en /api/audit/operations:", e);
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
