"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";
import { DayPicker } from "react-day-picker";
import type { DateRange as RDPDateRange } from "react-day-picker";
import "react-day-picker/dist/style.css";

const ReportsCharts = dynamic(() => import("./ReportsCharts"), {
  ssr: false,
  loading: () => (
    <div className="py-10 text-center text-sm text-neutral-500">Cargando gráficos…</div>
  ),
});

export type Store = { id: string; name: string };

export type Row = {
  day: string;
  store_id: string | null;
  tickets: number;
  revenue?: number | null;
  total_amount?: number | null;
  total?: number | null;
};

function getRevenue(row: Row): number {
  return Number(row.revenue ?? row.total_amount ?? row.total ?? 0) || 0;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function fmtDateShort(ymd: string): string {
  const parts = ymd.split("-");
  return `${parts[2]}/${parts[1]}`;
}

type ByDay = Record<string, Record<string, number>>;

const MOCK_STORES: Store[] = [
  ...require("@/lib/stores").STORES.map((s: any) => ({ id: s.id, name: s.short })),
];

export default function ReportsPage() {
  const [kpis, setKpis] = useState({ totalAmount: 0, tickets: 0, avgTicket: 0 });
  const [loadingKpis, setLoadingKpis] = useState(false);

  const today = new Date();

  const [range, setRange] = useState<RDPDateRange | undefined>({
    from: new Date(today.getFullYear(), today.getMonth(), 1),
    to: new Date(today.getFullYear(), today.getMonth() + 1, 0),
  });

  const [stores] = useState<Store[]>(MOCK_STORES);
  const [rowsAll, setRowsAll] = useState<Row[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);

  async function loadSummary() {
    try {
      setLoadingKpis(true);

      const fromStr = range?.from ? formatDate(range.from) : null;
      let toStr = range?.to ? formatDate(range.to) : null;
      if (!toStr && fromStr) toStr = fromStr;

      const params = new URLSearchParams();
      if (fromStr) params.append("from", fromStr);
      if (toStr) params.append("to", toStr);
      if (selectedStore) params.append("store_id", selectedStore);

      const res = await fetch(`/api/reports/summary?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);

      const data = await res.json();

      if (data.kpis) {
        setKpis({
          totalAmount: Number(data.kpis.totalAmount ?? 0),
          tickets: Number(data.kpis.tickets ?? 0),
          avgTicket: Number(data.kpis.avgTicket ?? 0),
        });
      } else {
        setKpis({ totalAmount: 0, tickets: 0, avgTicket: 0 });
      }

      setRowsAll(Array.isArray(data.rows) ? (data.rows as Row[]) : []);
    } catch (err) {
      console.error("Error cargando reportes", err);
      toast.error("Error cargando datos del reporte");
    } finally {
      setLoadingKpis(false);
    }
  }

  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, selectedStore]);

  const rows = rowsAll;

  // ─── Datos para el gráfico de línea ──────────────────────────────────────
  const lineChartData = useMemo(() => {
    const allDates = [...new Set(rows.map((r) => r.day))].filter(Boolean).sort();

    if (selectedStore) {
      return allDates.map((date) => {
        const row = rows.find((r) => r.day === date && r.store_id === selectedStore);
        return { date: fmtDateShort(date), total: row ? getRevenue(row) : 0 };
      });
    }

    // Una columna por sucursal
    return allDates.map((date) => {
      const entry: Record<string, string | number> = { date: fmtDateShort(date) };
      for (const s of stores) {
        const row = rows.find((r) => r.day === date && r.store_id === s.id);
        entry[s.id] = row ? getRevenue(row) : 0;
      }
      return entry;
    });
  }, [rows, selectedStore, stores]);

  // ─── Datos para el gráfico de barras ─────────────────────────────────────
  const barChartData = useMemo(() => {
    const visibleStores = selectedStore ? stores.filter((s) => s.id === selectedStore) : stores;
    return visibleStores.map((s) => ({
      name: s.name,
      id: s.id,
      total: rows.filter((r) => r.store_id === s.id).reduce((acc, r) => acc + getRevenue(r), 0),
    }));
  }, [rows, selectedStore, stores]);

  // ─── Tabla agrupada por día ───────────────────────────────────────────────
  const byDay: ByDay = useMemo(() => {
    const map: ByDay = {};
    for (const r of rows) {
      const day = r.day;
      const storeName = stores.find((st) => st.id === r.store_id)?.name || r.store_id || "Sin sucursal";
      if (!map[day]) map[day] = {};
      map[day][storeName] = (map[day][storeName] || 0) + getRevenue(r);
    }
    return map;
  }, [rows, stores]);

  const days = Object.keys(byDay).sort();

  const tooltipMoney = (v: number | string) =>
    `$${Number(v).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const hasData = lineChartData.length > 0;
  const hasBarData = barChartData.some((b) => b.total > 0);

  return (
    <main className="space-y-4 overflow-x-hidden p-3 sm:space-y-6 sm:p-4">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold sm:text-3xl">Reportes</h1>
        <p className="max-w-2xl text-sm text-neutral-600">
          Consulta ingresos por sucursal y rango de fechas. Los KPIs y los gráficos se actualizan automáticamente según tu selección.
        </p>
      </div>

      {/* ─── Calendario + KPIs ──────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(380px,1fr)_minmax(480px,1fr)]">
        <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="font-medium mb-2">Rango</h2>
          <div className="overflow-x-auto">
            <DayPicker
              mode="range"
              selected={range?.from ? range : undefined}
              onSelect={setRange}
              captionLayout="dropdown"
              fromYear={today.getFullYear() - 1}
              toYear={today.getFullYear()}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-medium">KPIs</h2>
              <div className="text-sm text-neutral-500">Sucursal</div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                Sucursal
              </label>
              <select
                className="w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-2 focus:ring-black/10"
                value={selectedStore ?? ""}
                onChange={(e) => setSelectedStore(e.target.value === "" ? null : e.target.value)}
              >
                <option value="">Todas</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Ingresos</div>
              <div className="mt-2 text-2xl font-semibold text-black">
                {loadingKpis
                  ? <div className="h-7 w-3/4 animate-pulse rounded-lg bg-neutral-200" />
                  : `$${kpis.totalAmount.toLocaleString("es-AR")}`}
              </div>
            </div>
            <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Tickets</div>
              <div className="mt-2 text-2xl font-semibold text-black">
                {loadingKpis
                  ? <div className="h-7 w-1/2 animate-pulse rounded-lg bg-neutral-200" />
                  : kpis.tickets}
              </div>
            </div>
            <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Ticket Prom.</div>
              <div className="mt-2 text-2xl font-semibold text-black">
                {loadingKpis
                  ? <div className="h-7 w-3/4 animate-pulse rounded-lg bg-neutral-200" />
                  : `$${kpis.avgTicket.toLocaleString("es-AR")}`}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Gráficos: recharts cargado lazily para no bloquear el bundle ─────── */}
      <ReportsCharts
        lineChartData={lineChartData}
        barChartData={barChartData}
        stores={stores}
        selectedStore={selectedStore}
        hasData={hasData}
        hasBarData={hasBarData}
        tooltipMoney={tooltipMoney}
      />

      {/* ─── Tabla por día y sucursal ────────────────────────────────────────── */}
      <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="font-medium mb-3">Ingresos por día y sucursal</h2>
        <table className="hidden min-w-[600px] w-full text-sm divide-y divide-neutral-200 md:table">
          <thead>
            <tr className="bg-gray-50 text-left text-xs uppercase tracking-[0.12em] text-neutral-600">
              <th className="py-3 pr-4">Día</th>
              <th className="py-3 pr-4">Sucursal</th>
              <th className="py-3 pr-4">Ingresos</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const storesOfDay = Object.keys(byDay[d]).sort();
              return storesOfDay.map((sn, i) => (
                <tr key={`${d}-${sn}`} className="border-b last:border-0">
                  <td className="py-2 pr-4">{i === 0 ? d : ""}</td>
                  <td className="py-2 pr-4">{sn}</td>
                  <td className="py-2 pr-4">
                    ${Number(byDay[d][sn] ?? 0).toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              ));
            })}
            {!days.length && (
              <tr>
                <td colSpan={3} className="py-10">
                  <div className="mx-auto max-w-xl rounded-3xl border border-dashed border-neutral-200 bg-neutral-50 px-6 py-6 text-center text-sm text-neutral-600">
                    <div className="mb-2 text-lg font-semibold text-black">Sin datos en el rango seleccionado</div>
                    <div className="text-xs text-neutral-500">
                      Cambiá el rango de fechas o la sucursal para ver resultados.
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="space-y-2 md:hidden">
          {days.length ? (
            days.map((d) =>
              Object.keys(byDay[d]).sort().map((sn) => (
                <div key={`${d}-${sn}`} className="rounded-2xl border bg-neutral-50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{sn}</div>
                      <div className="text-xs text-neutral-500">{d}</div>
                    </div>
                    <div className="font-semibold">
                      ${Number(byDay[d][sn] ?? 0).toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                </div>
              ))
            )
          ) : (
            <div className="rounded-3xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-600">
              <div className="mb-2 text-base font-semibold text-black">Sin datos en el rango seleccionado</div>
              <div className="text-xs text-neutral-500">Cambiá el rango de fechas o la sucursal para ver resultados.</div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
