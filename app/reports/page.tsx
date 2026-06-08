"use client";

import React, { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import type { DateRange as RDPDateRange } from "react-day-picker";
import "react-day-picker/dist/style.css";
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";

/** Tipos */
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

function fmtMoneyAxis(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

type ByDay = Record<string, Record<string, number>>;

const STORE_COLORS: Record<string, string> = {
  "914dee4d-a78c-4f3f-8998-402c56fc88e9": "#CC2020",
  "06ca13ff-d96d-4670-84d7-41057b3f6bc7": "#1A5FA8",
  "fb38a57d-78cc-4ccc-92d4-c2cc2cefd22f": "#A8C62A",
};

const MOCK_STORES: Store[] = [
  ...require("@/lib/stores").STORES.map((s: any) => ({ id: s.id, name: s.short })),
];

export default function ReportsPage() {
  const [kpis, setKpis] = useState({ totalAmount: 0, tickets: 0, avgTicket: 0 });
  const [loadingKpis, setLoadingKpis] = useState(false);
  const [mounted, setMounted] = useState(false);

  const today = new Date();

  const [range, setRange] = useState<RDPDateRange | undefined>({
    from: new Date(today.getFullYear(), today.getMonth(), 1),
    to: new Date(today.getFullYear(), today.getMonth() + 1, 0),
  });

  const [stores] = useState<Store[]>(MOCK_STORES);
  const [rowsAll, setRowsAll] = useState<Row[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

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
      alert("Error cargando datos del reporte");
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
    <main className="p-4 space-y-6">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold">Reportes</h1>
        <p className="max-w-2xl text-sm text-neutral-600">
          Consulta ingresos por sucursal y rango de fechas. Los KPIs y los gráficos se actualizan automáticamente según tu selección.
        </p>
      </div>

      {/* ─── Calendario + KPIs ──────────────────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-[minmax(380px,1fr)_minmax(480px,1fr)]">
        <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="font-medium mb-2">Rango</h2>
          <DayPicker
            mode="range"
            selected={range?.from ? range : undefined}
            onSelect={setRange}
            captionLayout="dropdown"
            fromYear={today.getFullYear() - 1}
            toYear={today.getFullYear()}
          />
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

          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Ingresos</div>
              <div className="mt-2 text-2xl font-semibold text-black">
                {loadingKpis ? "Cargando..." : `$${kpis.totalAmount.toLocaleString("es-AR")}`}
              </div>
            </div>
            <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Tickets</div>
              <div className="mt-2 text-2xl font-semibold text-black">
                {loadingKpis ? "Cargando..." : kpis.tickets}
              </div>
            </div>
            <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Ticket Prom.</div>
              <div className="mt-2 text-2xl font-semibold text-black">
                {loadingKpis ? "Cargando..." : `$${kpis.avgTicket.toLocaleString("es-AR")}`}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Gráfico de línea: evolución de ventas diarias ──────────────────── */}
      {mounted && (
        <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="font-medium mb-4">Evolución de ventas diarias</h2>
          {!hasData ? (
            <p className="py-10 text-center text-sm text-neutral-500">
              Sin datos en el rango seleccionado.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={lineChartData} margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={fmtMoneyAxis} tick={{ fontSize: 11 }} width={60} />
                <Tooltip
                  formatter={(v, name) => [
                    tooltipMoney(v as number),
                    typeof name === "string" && name in STORE_COLORS
                      ? (stores.find((s) => s.id === name)?.name ?? name)
                      : name,
                  ]}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                {selectedStore ? (
                  <Line
                    type="monotone"
                    dataKey="total"
                    name={stores.find((s) => s.id === selectedStore)?.name ?? "Ventas"}
                    stroke={STORE_COLORS[selectedStore] ?? "#1A5FA8"}
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                ) : (
                  stores.map((s) => (
                    <Line
                      key={s.id}
                      type="monotone"
                      dataKey={s.id}
                      name={s.name}
                      stroke={STORE_COLORS[s.id] ?? "#888"}
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  ))
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>
      )}

      {/* ─── Gráfico de barras: comparación por sucursal ────────────────────── */}
      {mounted && (
        <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="font-medium mb-4">Ingresos totales por sucursal</h2>
          {!hasBarData ? (
            <p className="py-10 text-center text-sm text-neutral-500">
              Sin datos en el rango seleccionado.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barChartData} margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={fmtMoneyAxis} tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(v) => [tooltipMoney(v as number), "Ingresos"]} />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {barChartData.map((entry) => (
                    <Cell key={entry.id} fill={STORE_COLORS[entry.id] ?? "#888"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      )}

      {/* ─── Tabla por día y sucursal ────────────────────────────────────────── */}
      <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm overflow-x-auto">
        <h2 className="font-medium mb-3">Ingresos por día y sucursal</h2>
        <table className="min-w-[600px] w-full text-sm divide-y divide-neutral-200">
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
      </section>
    </main>
  );
}
