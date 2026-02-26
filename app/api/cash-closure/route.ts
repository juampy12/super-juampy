export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PaymentBreakdown = {
  cash?: number;
  debit?: number;
  credit?: number;
  mp?: number;
  account?: number;
};

type Payment = {
  method?: string;
  total_paid?: number;
  change?: number;
  breakdown?: PaymentBreakdown | null;
};

type SaleRow = {
  id: string;
  created_at: string;
  total: number | string | null;
  store_id: string | null;
  status: string | null;
  payment: Payment | null;
  register_id: string | null;
};

function safeNumber(v: any): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

// dateParam: "YYYY-MM-DD" (día en Argentina)
// AR es UTC-03:00 fijo → AR 00:00 = UTC 03:00
function argentinaDayToUtcRange(dateParam: string) {
  // start exclusive/inclusive: >= startUtc && < endUtc
  const startUtcIso = `${dateParam}T03:00:00.000Z`;

  const d = new Date(`${dateParam}T00:00:00.000Z`); // referencia estable
  d.setUTCDate(d.getUTCDate() + 1);
  const nextDay = d.toISOString().slice(0, 10);
  const endUtcIso = `${nextDay}T03:00:00.000Z`;

  return { startUtcIso, endUtcIso };
}

function formatHourKeyAR(ts: string) {
  const dt = new Date(ts);
  const hh = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    hour12: false,
  }).format(dt);
  return `${hh}:00`;
}

function formatTimeAR(ts: string) {
  const dt = new Date(ts);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const dateParam = searchParams.get("date"); // YYYY-MM-DD (Argentina)
    const storeId = searchParams.get("store_id");
    const registerId = searchParams.get("register_id");

    if (!dateParam || !storeId) {
      return NextResponse.json({ error: "Falta date o store_id" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json({ error: "date inválida (formato YYYY-MM-DD)" }, { status: 400 });
    }
    if (!isUuid(storeId)) {
      return NextResponse.json({ error: "store_id inválido (debe ser UUID)" }, { status: 400 });
    }
    if (registerId && !isUuid(registerId)) {
      return NextResponse.json({ error: "register_id inválido (debe ser UUID)" }, { status: 400 });
    }

    const { startUtcIso, endUtcIso } = argentinaDayToUtcRange(dateParam);

    // 1) Ventas confirmadas por sucursal + rango del día Argentina (filtrado en DB)
    let q = supabaseAdmin
      .from("sales")
      .select("id, created_at, total, store_id, status, payment, register_id")
      .eq("status", "confirmed")
      .eq("store_id", storeId)
      .gte("created_at", startUtcIso)
      .lt("created_at", endUtcIso)
      .order("created_at", { ascending: true });

    if (registerId) q = q.eq("register_id", registerId);

    const { data, error } = await q;

    if (error) {
      console.error("Supabase error /api/cash-closure:", error);
      throw error;
    }

    const rows: SaleRow[] = (data ?? []) as any;

    if (!rows.length) {
      return NextResponse.json({
        kpis: { totalAmount: 0, tickets: 0, avgTicket: 0, cashIn: 0, change: 0, netCash: 0 },
        methods: [
          { key: "efectivo", label: "Efectivo", total: 0 },
          { key: "debito", label: "Débito", total: 0 },
          { key: "credito", label: "Crédito", total: 0 },
          { key: "mp", label: "Mercado Pago", total: 0 },
          { key: "account", label: "Cuenta corriente", total: 0 },
        ],
        hourly: [],
        tickets: [],
        meta: { mixtoTickets: 0, mixtoTotal: 0 },
      });
    }

    // 2) Acumuladores
    let totalAmount = 0;
    let tickets = 0;

    let cashIn = 0;
    let totalChange = 0;

    const methodTotals: Record<string, number> = {
      efectivo: 0,
      debito: 0,
      credito: 0,
      mp: 0,
      account: 0,
    };

    let mixtoTickets = 0;
    let mixtoTotal = 0;

    const hourlyMap: Record<string, { tickets: number; total: number }> = {};
    const ticketsOut: any[] = [];

    for (const row of rows) {
      const saleTotal = safeNumber(row.total);
      totalAmount += saleTotal;
      tickets += 1;

      const hourKey = formatHourKeyAR(row.created_at);
      if (!hourlyMap[hourKey]) hourlyMap[hourKey] = { tickets: 0, total: 0 };
      hourlyMap[hourKey].tickets += 1;
      hourlyMap[hourKey].total += saleTotal;

      const p: Payment | null = row.payment ?? null;
      const method = (p?.method ?? "desconocido") as string;
      const change = safeNumber(p?.change ?? 0);
      const breakdown = (p?.breakdown ?? {}) as PaymentBreakdown;

      let ticketCash = 0;
      let ticketDebit = 0;
      let ticketCredit = 0;
      let ticketMp = 0;
      let ticketAccount = 0;

      if (method === "efectivo") {
        const cash = safeNumber(breakdown?.cash ?? p?.total_paid ?? saleTotal);
        methodTotals.efectivo += cash;
        cashIn += cash;
        totalChange += change;
        ticketCash = cash;
      } else if (method === "debito") {
        const paid = safeNumber(breakdown?.debit ?? p?.total_paid ?? saleTotal);
        methodTotals.debito += paid;
        ticketDebit = paid;
      } else if (method === "credito") {
        const paid = safeNumber(breakdown?.credit ?? p?.total_paid ?? saleTotal);
        methodTotals.credito += paid;
        ticketCredit = paid;
      } else if (method === "mp") {
        const paid = safeNumber(breakdown?.mp ?? p?.total_paid ?? saleTotal);
        methodTotals.mp += paid;
        ticketMp = paid;
      } else if (method === "cuenta_corriente") {
        const paid = safeNumber(breakdown?.account ?? p?.total_paid ?? saleTotal);
        methodTotals.account += paid;
        ticketAccount = paid;
      } else if (method === "mixto") {
        const cash = safeNumber(breakdown.cash ?? 0);
        const debit = safeNumber(breakdown.debit ?? 0);
        const credit = safeNumber(breakdown.credit ?? 0);
        const mp = safeNumber(breakdown.mp ?? 0);
        const account = safeNumber(breakdown.account ?? 0);

        methodTotals.efectivo += cash;
        methodTotals.debito += debit;
        methodTotals.credito += credit;
        methodTotals.mp += mp;
        methodTotals.account += account;

        cashIn += cash;
        totalChange += change;

        ticketCash = cash;
        ticketDebit = debit;
        ticketCredit = credit;
        ticketMp = mp;
        ticketAccount = account;

        mixtoTickets += 1;
        mixtoTotal += saleTotal;
      }

      ticketsOut.push({
        id: row.id,
        time: formatTimeAR(row.created_at),
        total: saleTotal,
        method,
        method_label:
          method === "efectivo"
            ? "Efectivo"
            : method === "debito"
            ? "Débito"
            : method === "credito"
            ? "Crédito"
            : method === "mp"
            ? "Mercado Pago"
            : method === "cuenta_corriente"
            ? "Cuenta corriente"
            : method === "mixto"
            ? "Mixto"
            : "Desconocido",
        cash: ticketCash || undefined,
        debit: ticketDebit || undefined,
        credit: ticketCredit || undefined,
        mp: ticketMp || undefined,
        account: ticketAccount || undefined,
        change: change || undefined,
      });
    }

    const avgTicket = tickets ? totalAmount / tickets : 0;
    const netCash = cashIn - totalChange;

    const hourly = Object.entries(hourlyMap)
      .map(([hour, vals]) => ({ hour, tickets: vals.tickets, total: vals.total }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    const methods = [
      { key: "efectivo", label: "Efectivo", total: methodTotals.efectivo },
      { key: "debito", label: "Débito", total: methodTotals.debito },
      { key: "credito", label: "Crédito", total: methodTotals.credito },
      { key: "mp", label: "Mercado Pago", total: methodTotals.mp },
      { key: "account", label: "Cuenta corriente", total: methodTotals.account },
    ];

    return NextResponse.json({
      kpis: { totalAmount, tickets, avgTicket, cashIn, change: totalChange, netCash },
      methods,
      hourly,
      tickets: ticketsOut,
      meta: { mixtoTickets, mixtoTotal },
    });
  } catch (err) {
    console.error("Error en /api/cash-closure:", err);
    return NextResponse.json({ error: "Error generando cierre de caja" }, { status: 500 });
  }
}
