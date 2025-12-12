"use client";

import React, { useEffect, useState } from "react";

type Store = { id: string; name: string };

type Kpis = {
  totalAmount: number;
  tickets: number;
  avgTicket: number;
  cashIn: number;
  change: number;
  netCash: number;
};

type MethodSummary = {
  key: string;
  label: string;
  total: number;
};

type HourRow = {
  hour: string;
  tickets: number;
  total: number;
};

type TicketRow = {
  id: string;
  time: string;
  total: number;
  method: string;
  method_label: string;
  cash?: number;
  debit?: number;
  credit?: number;
  mp?: number;
  account?: number;
  change?: number;
};

type MetaInfo = {
  mixtoTickets: number;
  mixtoTotal: number;
};
type ExistingClosure = {
  id: string;
  store_id: string | null;
  date: string;
  closed_at: string | null;
  total_sales: number;
  total_tickets: number;
  total_cash: number;
};

const STORES: Store[] = [
  { id: "06ca13ff-d96d-4670-84d7-41057b3f6bc7", name: "Av. San Martín" },
  { id: "914dee4d-a78c-4f3f-8998-402c56fc88e9", name: "Alberdi" },
  { id: "fb38a57d-78cc-4ccc-92d4-c2cc2cefd22f", name: "Tacuari" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function CashClosurePage() {
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [selectedStore, setSelectedStore] = useState<string>(
    STORES[0]?.id ?? ""
  );

  const [kpis, setKpis] = useState<Kpis>({
    totalAmount: 0,
    tickets: 0,
    avgTicket: 0,
    cashIn: 0,
    change: 0,
    netCash: 0,
  });

  const [methods, setMethods] = useState<MethodSummary[]>([]);
  const [hourly, setHourly] = useState<HourRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [meta, setMeta] = useState<MetaInfo | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
const [existingClosure, setExistingClosure] = useState<ExistingClosure | null>(null);
  async function handleConfirmClosure() {
    try {
      if (!selectedDate || !selectedStore) {
        alert("Falta seleccionar fecha o sucursal.");
        return;
      }

      if (kpis.tickets === 0) {
        alert("No hay tickets para cerrar en esta fecha y sucursal.");
        return;
      }

      const store = STORES.find((s) => s.id === selectedStore);
      const storeLabel = store?.name ?? "Sucursal";

      const ok = window.confirm(
        `¿Confirmar cierre de caja para ${storeLabel} - ${selectedDate}?`
      );
      if (!ok) return;

      setSaving(true);

      // Mapeo de totales por método
      const methodMap: Record<string, number> = {};
      for (const m of methods) {
        methodMap[m.key] = m.total;
      }

      const payload = {
        store_id: selectedStore,
        date: selectedDate,
        total_sales: kpis.totalAmount,
        total_tickets: kpis.tickets,
        total_cash: methodMap["cash"] ?? 0,
        total_debit: methodMap["debit"] ?? 0,
        total_credit: methodMap["credit"] ?? 0,
        total_mp: methodMap["mp"] ?? 0,
        total_cuenta_corriente: methodMap["account"] ?? 0,
        total_mixto: methodMap["mixto"] ?? 0,
      };

      const res = await fetch("/api/cash-closures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        alert(json.error ?? "Error al guardar el cierre.");
        return;
      }

      alert("Cierre de caja guardado correctamente ✅");
    } catch (err) {
      console.error("Error confirmando cierre de caja", err);
      alert("Error inesperado al guardar el cierre.");
    } finally {
      setSaving(false);
    }
  }
async function handleReplaceClosure() {
  try {
    if (!selectedDate || !selectedStore) {
      alert("Falta seleccionar fecha o sucursal.");
      return;
    }

    if (!kpis.tickets || kpis.tickets === 0) {
      alert("No hay tickets para esta fecha y sucursal.");
      return;
    }

    if (!existingClosure) {
      alert("No hay un cierre previo para reemplazar.");
      return;
    }

    if (
      !window.confirm(
        "Esto va a reemplazar el cierre existente con los datos actuales que ves en pantalla. ¿Continuar?"
      )
    ) {
      return;
    }

    setSaving(true);

    // Misma lógica que en handleConfirmClosure para armar los totales
    const findMethodTotal = (...candidates: string[]) => {
      const lowers = candidates.map((c) => c.toLowerCase());
      const m = methods.find((m) => {
        const key = (m.key || "").toLowerCase();
        const label = (m.label || "").toLowerCase();
        return (
          lowers.includes(key) || lowers.some((c) => label.includes(c))
        );
      });
      return m?.total ?? 0;
    };

    const payload = {
      store_id: selectedStore,
      date: selectedDate,
      total_sales: kpis.totalAmount,
      total_tickets: kpis.tickets,
      total_cash: findMethodTotal("cash", "efectivo"),
      total_debit: findMethodTotal("debit", "debito", "débito"),
      total_credit: findMethodTotal("credit", "credito", "crédito"),
      total_mp: findMethodTotal("mp", "mercado pago"),
      total_cuenta_corriente: findMethodTotal(
        "account",
        "cuenta_corriente",
        "cta cte"
      ),
      total_mixto: meta?.mixtoTotal ?? 0,
      first_ticket_at: null,
      last_ticket_at: null,
      notes: null,
    };

    const res = await fetch("/api/cash-closures", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const msg = errJson?.error || `Error HTTP ${res.status}`;
      alert(`Error reemplazando el cierre: ${msg}`);
      return;
    }

    alert("Cierre de caja reemplazado correctamente ✅");
    await loadClosure();
  } catch (e) {
    console.error("Error en handleReplaceClosure", e);
    alert("Error inesperado reemplazando el cierre.");
  } finally {
    setSaving(false);
  }
}

  function formatMoney(n: number) {
    return `$${n.toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
async function loadClosure() {
  try {
    if (!selectedDate || !selectedStore) {
      setExistingClosure(null);
      return;
    }

    setLoading(true);

    const params = new URLSearchParams();
    params.append("date", selectedDate);
    params.append("store_id", selectedStore);

    const res = await fetch(`/api/cash-closures?${params.toString()}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      setExistingClosure(null);
      return;
    }

    const json = await res.json();
    console.log("CASH CLOSURE RESPONSE:", json);

    // Caso 1: API devuelve { data: row }
    if (json && json.data && !Array.isArray(json.data)) {
      setExistingClosure(json.data);
      return;
    }

    // Caso 2: API devuelve array directo
    if (Array.isArray(json)) {
      const match = json.find(
        (row: any) =>
          row.date === selectedDate && row.store_id === selectedStore
      );
      setExistingClosure(match ?? null);
      return;
    }

    // Caso 3: API devuelve { data: rows[] }
    if (Array.isArray(json?.data)) {
      const match = json.data.find(
        (row: any) =>
          row.date === selectedDate && row.store_id === selectedStore
      );
      setExistingClosure(match ?? null);
      return;
    }

    setExistingClosure(null);
  } catch (err) {
    console.error("Error cargando cierre de caja", err);
    alert("Error cargando el cierre de caja");
    setExistingClosure(null);
  } finally {
    setLoading(false);
  }
}
  async function loadData() {
    try {
      if (!selectedDate || !selectedStore) {
        setKpis({
          totalAmount: 0,
          tickets: 0,
          avgTicket: 0,
          cashIn: 0,
          change: 0,
          netCash: 0,
        });
        setMethods([]);
        setHourly([]);
        setTickets([]);
        setMeta(null);
        return;
      }

      setLoading(true);

      const params = new URLSearchParams();
      params.append("date", selectedDate);
      params.append("store_id", selectedStore);

      const res = await fetch(`/api/cash-closure?${params.toString()}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        console.error("Error HTTP en /api/cash-closure", res.status);
        setKpis({
          totalAmount: 0,
          tickets: 0,
          avgTicket: 0,
          cashIn: 0,
          change: 0,
          netCash: 0,
        });
        setMethods([]);
        setHourly([]);
        setTickets([]);
        setMeta(null);
        return;
      }

      const data = await res.json();
      console.log("CASH CLOSURE SUMMARY:", data);

      const rawKpis = data.kpis ?? {};
      setKpis({
        totalAmount: Number(rawKpis.totalAmount ?? 0),
        tickets: Number(rawKpis.tickets ?? 0),
        avgTicket: Number(rawKpis.avgTicket ?? 0),
        cashIn: Number(rawKpis.cashIn ?? 0),
        change: Number(rawKpis.change ?? 0),
        netCash: Number(rawKpis.netCash ?? 0),
      });

      setMethods(
        Array.isArray(data.methods)
          ? data.methods.map((m: any) => ({
              key: String(m.key ?? m.method ?? ""),
              label: String(m.label ?? m.method_label ?? m.key ?? ""),
              total: Number(m.total ?? 0),
            }))
          : []
      );

      setHourly(
        Array.isArray(data.hourly)
          ? data.hourly.map((h: any) => ({
              hour: String(h.hour ?? ""),
              tickets: Number(h.tickets ?? 0),
              total: Number(h.total ?? 0),
            }))
          : []
      );

      setTickets(
        Array.isArray(data.tickets)
          ? data.tickets.map((t: any) => ({
              id: String(t.id ?? ""),
              time: String(t.time ?? t.hour ?? ""),
              total: Number(t.total ?? 0),
              method: String(t.method ?? ""),
              method_label: String(
                t.method_label ?? t.method ?? "Sin método"
              ),
              cash:
                t.cash !== null && t.cash !== undefined
                  ? Number(t.cash)
                  : undefined,
              debit:
                t.debit !== null && t.debit !== undefined
                  ? Number(t.debit)
                  : undefined,
              credit:
                t.credit !== null && t.credit !== undefined
                  ? Number(t.credit)
                  : undefined,
              mp:
                t.mp !== null && t.mp !== undefined
                  ? Number(t.mp)
                  : undefined,
              account:
                t.account !== null && t.account !== undefined
                  ? Number(t.account)
                  : undefined,
              change:
                t.change !== null && t.change !== undefined
                  ? Number(t.change)
                  : undefined,
            }))
          : []
      );

      const rawMeta = data.meta ?? null;
      setMeta(
        rawMeta
          ? {
              mixtoTickets: Number(rawMeta.mixtoTickets ?? 0),
              mixtoTotal: Number(rawMeta.mixtoTotal ?? 0),
            }
          : null
      );
    } catch (err) {
      console.error("Error cargando datos de cierre", err);
      alert("Error cargando datos de cierre");
      setKpis({
        totalAmount: 0,
        tickets: 0,
        avgTicket: 0,
        cashIn: 0,
        change: 0,
        netCash: 0,
      });
      setMethods([]);
      setHourly([]);
      setTickets([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    void loadClosure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedStore]);

  const storeName =
    STORES.find((s) => s.id === selectedStore)?.name ?? "Sucursal";

  return (
    <main className="p-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cierre de caja</h1>
          <p className="text-sm text-neutral-500">
            Resumen diario por sucursal, con desglose de métodos de pago y
            tickets.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 md:items-end">
          <div className="flex flex-col text-sm">
            <label className="text-neutral-500 mb-1">Fecha</label>
            <input
              type="date"
              className="rounded border px-2 py-1 text-sm"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col text-sm">
            <label className="text-neutral-500 mb-1">Sucursal</label>
            <select
              className="rounded border px-2 py-1 text-sm"
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
            >
              {STORES.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
{/* Botón principal: Confirmar cierre */}
<button
  type="button"
  onClick={handleConfirmClosure}
  disabled={loading || saving || kpis.tickets === 0 || !!existingClosure}
  className="mt-2 md:mt-0 inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
>
  {saving ? "Guardando cierre..." : "Confirmar cierre"}
</button>

{/* Info de cierre existente y botón para reemplazar */}
{existingClosure && (
  <div className="mt-2 text-xs text-emerald-700">
    Ya existe un cierre para esta fecha. Total ventas{" "}
    <span className="font-semibold">
      {formatMoney(existingClosure.total_sales)}
    </span>
    , tickets{" "}
    <span className="font-semibold">
      {existingClosure.total_tickets}
    </span>
    , efectivo{" "}
    <span className="font-semibold">
      {formatMoney(existingClosure.total_cash)}
    </span>
    <button
      type="button"
      onClick={handleReplaceClosure}
      className="ml-3 inline-flex items-center rounded-md bg-amber-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-amber-600"
      disabled={loading || saving || kpis.tickets === 0}
    >
      Reemplazar cierre con datos actuales
</button>
</div>
)}
        </div>
      </div>

      {/* KPIs principales */}
      <section className="grid gap-4 md:grid-cols-4">
        {/* Total del día */}
        <div className="md:col-span-2 rounded-xl border p-4 bg-neutral-50">
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
            Total del día
          </div>
          <div className="text-4xl font-bold mb-2">
            {loading ? "Cargando..." : formatMoney(kpis.totalAmount)}
          </div>
          <div className="text-sm text-neutral-600">
            {storeName} · {selectedDate || "-"}
          </div>
        </div>

        {/* Efectivo cobrado */}
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500 mb-1">Efectivo cobrado</div>
          <div className="text-3xl font-semibold">
            {loading ? "…" : formatMoney(kpis.cashIn)}
          </div>
          <p className="text-xs text-neutral-500 mt-2">
            Suma de pagos en efectivo (incluyendo parte en ventas mixtas).
          </p>
        </div>

        {/* Neto esperado en caja */}
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500 mb-1">
            Neto esperado en caja
          </div>
          <div className="text-3xl font-semibold">
            {loading ? "…" : formatMoney(kpis.netCash)}
          </div>
          <p className="text-xs text-neutral-500 mt-2">
            Efectivo cobrado menos vuelto entregado.
          </p>
        </div>
      </section>

      {/* Desglose por método de pago */}
      <section className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium text-sm">Métodos de pago</h2>
          <span className="text-xs text-neutral-500">
            Total tickets: {kpis.tickets} · Ticket promedio:{" "}
            {formatMoney(kpis.avgTicket || 0)}
          </span>
        </div>

        {methods.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No hay información de métodos para este día.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {methods.map((m) => (
              <div
                key={m.key}
                className="rounded-lg border px-3 py-2 bg-white flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-medium">{m.label}</div>
                </div>
                <div className="text-sm font-semibold">
                  {formatMoney(m.total)}
                </div>
              </div>
            ))}
          </div>
        )}

        {meta && meta.mixtoTickets > 0 && (
          <p className="text-xs text-neutral-500">
            Ventas mixtas: {meta.mixtoTickets} tickets · Total imputado en
            mixto: {formatMoney(meta.mixtoTotal)}
          </p>
        )}
      </section>

      {/* Ventas por hora */}
      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-medium text-sm">Ventas por hora</h2>

        {hourly.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No hay ventas registradas en esta fecha.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b bg-neutral-50">
                  <th className="text-left py-2 px-2">Hora</th>
                  <th className="text-right py-2 px-2">Tickets</th>
                  <th className="text-right py-2 px-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {hourly.map((h) => (
                  <tr key={h.hour} className="border-b last:border-0">
                    <td className="py-1 px-2">{h.hour}</td>
                    <td className="py-1 px-2 text-right">{h.tickets}</td>
                    <td className="py-1 px-2 text-right">
                      {formatMoney(h.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Detalle de tickets */}
      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-medium text-sm">Detalle de tickets</h2>

        {tickets.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No hay tickets confirmados para esta fecha y sucursal.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b bg-neutral-50">
                  <th className="text-left py-2 px-2">Hora</th>
                  <th className="text-right py-2 px-2">Total</th>
                  <th className="text-left py-2 px-2">Método</th>
                  <th className="text-right py-2 px-2">Efectivo</th>
                  <th className="text-right py-2 px-2">Débito</th>
                  <th className="text-right py-2 px-2">Crédito</th>
                  <th className="text-right py-2 px-2">MP</th>
                  <th className="text-right py-2 px-2">Cuenta</th>
                  <th className="text-right py-2 px-2">Vuelto</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="py-1 px-2">{t.time}</td>
                    <td className="py-1 px-2 text-right">
                      {formatMoney(t.total)}
                    </td>
                    <td className="py-1 px-2">{t.method_label}</td>
                    <td className="py-1 px-2 text-right">
                      {t.cash ? formatMoney(t.cash) : "—"}
                    </td>
                    <td className="py-1 px-2 text-right">
                      {t.debit ? formatMoney(t.debit) : "—"}
                    </td>
                    <td className="py-1 px-2 text-right">
                      {t.credit ? formatMoney(t.credit) : "—"}
                    </td>
                    <td className="py-1 px-2 text-right">
                      {t.mp ? formatMoney(t.mp) : "—"}
                    </td>
                    <td className="py-1 px-2 text-right">
                      {t.account ? formatMoney(t.account) : "—"}
                    </td>
                    <td className="py-1 px-2 text-right">
                      {t.change ? formatMoney(t.change) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pie explicativo */}
      <section className="rounded-xl border p-4 text-xs text-neutral-500">
        Basado solo en ventas con estado <strong>confirmed</strong> de la fecha
        seleccionada y la sucursal elegida. Usá este resumen como base para tu
        cierre de caja físico (conteo de billetes, terminales y MP).
      </section>
    </main>
  );
}
