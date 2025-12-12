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
};

function safeNumber(v: any): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Día en horario Argentina, formateado YYYY-MM-DD
function getArgentinaDay(ts: string | Date): string {
  const d = new Date(ts);
  // Argentina -03:00, sin DST
  const arg = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return arg.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date"); // YYYY-MM-DD
    const storeId = searchParams.get("store_id");

    if (!dateParam || !storeId) {
      return NextResponse.json(
        { error: "Falta date o store_id" },
        { status: 400 }
      );
    }

    // 1) Traemos TODAS las ventas confirmed de esa sucursal
    const { data, error } = await supabaseAdmin
      .from("sales")
      .select("id, created_at, total, store_id, status, payment")
      .eq("status", "confirmed")
      .eq("store_id", storeId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Supabase error /api/cash-closure:", error);
      throw error;
    }

    const rows: SaleRow[] = (data ?? []) as any;

    // 2) Filtramos por día en horario AR
    const filtered = rows.filter(
      (r) => getArgentinaDay(r.created_at) === dateParam
    );

    // Si no hay ventas, devolvemos todo en cero
    if (!filtered.length) {
      return NextResponse.json({
        kpis: {
          totalAmount: 0,
          tickets: 0,
          avgTicket: 0,
          cashIn: 0,
          change: 0,
          netCash: 0,
        },
        methods: [
          { key: "efectivo", label: "Efectivo", total: 0 },
          { key: "debito", label: "Débito", total: 0 },
          { key: "credito", label: "Crédito", total: 0 },
          { key: "mp", label: "Mercado Pago", total: 0 },
          { key: "account", label: "Cuenta corriente", total: 0 },
        ],
        hourly: [],
        tickets: [],
        meta: {
          mixtoTickets: 0,
          mixtoTotal: 0,
        },
      });
    }

    // 3) Acumuladores
    let totalAmount = 0;
    let tickets = 0;

    let cashIn = 0; // efectivo cobrado
    let totalChange = 0; // vuelto entregado

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

    for (const row of filtered) {
      const saleTotal = safeNumber(row.total);
      totalAmount += saleTotal;
      tickets += 1;

      // Hora en AR para curva horaria
      const d = new Date(row.created_at);
      const arg = new Date(d.getTime() - 3 * 60 * 60 * 1000);
      const hour = arg.toISOString().substring(11, 13);
      const hourKey = `${hour}:00`;

      if (!hourlyMap[hourKey]) {
        hourlyMap[hourKey] = { tickets: 0, total: 0 };
      }
      hourlyMap[hourKey].tickets += 1;
      hourlyMap[hourKey].total += saleTotal;

      // Pagos
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
        const paid = safeNumber(p?.total_paid ?? saleTotal);
        methodTotals.efectivo += paid;
        cashIn += paid;
        totalChange += change;
        ticketCash = paid;
      } else if (method === "debito") {
        const paid = safeNumber(p?.total_paid ?? saleTotal);
        methodTotals.debito += paid;
        ticketDebit = paid;
      } else if (method === "credito") {
        const paid = safeNumber(p?.total_paid ?? saleTotal);
        methodTotals.credito += paid;
        ticketCredit = paid;
      } else if (method === "mp") {
        const paid = safeNumber(p?.total_paid ?? saleTotal);
        methodTotals.mp += paid;
        ticketMp = paid;
      } else if (method === "cuenta_corriente") {
        const paid = safeNumber(p?.total_paid ?? saleTotal);
        methodTotals.account += paid;
        ticketAccount = paid;
      } else if (method === "mixto") {
        // Usamos breakdown para repartir
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

      const timeStr = arg.toTimeString().slice(0, 5); // HH:MM

      ticketsOut.push({
        id: row.id,
        time: timeStr,
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
      .map(([hour, vals]) => ({
        hour,
        tickets: vals.tickets,
        total: vals.total,
      }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    const methods = [
      { key: "efectivo", label: "Efectivo", total: methodTotals.efectivo },
      { key: "debito", label: "Débito", total: methodTotals.debito },
      { key: "credito", label: "Crédito", total: methodTotals.credito },
      { key: "mp", label: "Mercado Pago", total: methodTotals.mp },
      { key: "account", label: "Cuenta corriente", total: methodTotals.account },
    ];

    return NextResponse.json({
      kpis: {
        totalAmount,
        tickets,
        avgTicket,
        cashIn,
        change: totalChange,
        netCash,
      },
      methods,
      hourly,
      tickets: ticketsOut,
      meta: {
        mixtoTickets,
        mixtoTotal,
      },
    });
  } catch (err) {
    console.error("Error en /api/cash-closure:", err);
    return NextResponse.json(
      { error: "Error generando cierre de caja" },
      { status: 500 }
    );
  }
}
