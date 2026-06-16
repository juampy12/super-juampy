import { supabaseAdmin } from "./supabaseAdmin";

export type ClosureTotals = {
  total_sales: number;
  total_tickets: number;
  total_cash: number;
  total_debit: number;
  total_credit: number;
  total_mp: number;
  total_cuenta_corriente: number;
  total_mixto: number;
};

// Argentina = UTC-3 fijo (sin DST)
function argentinaDayToUtcRange(date: string) {
  const startUtcIso = `${date}T03:00:00.000Z`;
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const nextDay = d.toISOString().slice(0, 10);
  return { startUtcIso, endUtcIso: `${nextDay}T03:00:00.000Z` };
}

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function computeClosureTotals(
  storeId: string,
  date: string,
  registerId?: string | null
): Promise<ClosureTotals> {
  const { startUtcIso, endUtcIso } = argentinaDayToUtcRange(date);

  let q = supabaseAdmin
    .from("sales")
    .select("total, payment")
    .eq("status", "confirmed")
    .eq("store_id", storeId)
    .gte("created_at", startUtcIso)
    .lt("created_at", endUtcIso);

  if (registerId) q = q.eq("register_id", registerId);

  const { data, error } = await q;
  if (error) throw error;

  let total_sales = 0, total_tickets = 0, total_cash = 0, total_debit = 0;
  let total_credit = 0, total_mp = 0, total_cuenta_corriente = 0, total_mixto = 0;

  for (const row of data ?? []) {
    const saleTotal = safeNum(row.total);
    total_sales += saleTotal;
    total_tickets += 1;

    const p = row.payment as Record<string, any> | null;
    const method = String(p?.method ?? "");
    const bd = (p?.breakdown ?? {}) as Record<string, any>;
    const paid = safeNum(p?.total_paid ?? saleTotal);

    if (method === "efectivo") {
      total_cash += safeNum(bd.cash ?? paid);
    } else if (method === "debito") {
      total_debit += safeNum(bd.debit ?? paid);
    } else if (method === "credito") {
      total_credit += safeNum(bd.credit ?? paid);
    } else if (method === "mp") {
      total_mp += safeNum(bd.mp ?? paid);
    } else if (method === "cuenta_corriente") {
      total_cuenta_corriente += safeNum(bd.cuenta_corriente ?? bd.account ?? paid);
    } else if (method === "mixto") {
      total_cash += safeNum(bd.cash ?? 0);
      total_debit += safeNum(bd.debit ?? 0);
      total_credit += safeNum(bd.credit ?? 0);
      total_mp += safeNum(bd.mp ?? 0);
      total_cuenta_corriente += safeNum(bd.cuenta_corriente ?? bd.account ?? 0);
      total_mixto += saleTotal;
    }
  }

  return { total_sales, total_tickets, total_cash, total_debit, total_credit, total_mp, total_cuenta_corriente, total_mixto };
}
