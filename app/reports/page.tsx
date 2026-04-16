"use client";

import React, { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import type { DateRange as RDPDateRange } from "react-day-picker";
import "react-day-picker/dist/style.css";

/** Tipos */
export type Store = { id: string; name: string };

export type Row = {
  day: string;           // '2025-12-05'
  store_id: string | null;
  tickets: number;

  revenue?: number | null;      // por si en algún momento lo llamaste así
  total_amount?: number | null; // nombre actual en la vista
  total?: number | null;        // fallback
};

// 👉 saca el valor correcto de ingresos sin importar el campo
function getRevenue(row: Row): number {
  return (
    Number(row.revenue ?? row.total_amount ?? row.total ?? 0) || 0
  );
}

// helper para enviar YYYY-MM-DD
function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Helpers para la tabla */
type ByDay = Record<string, Record<string, number>>;

// IDs reales de tus sucursales
const MOCK_STORES: Store[] = [
  { id: "914dee4d-a78c-4f3f-8998-402c56fc88e9", name: "Alberdi" },
  { id: "06ca13ff-d96d-4670-84d7-41057b3f6bc7", name: "Av. San Martín" },
  { id: "fb38a57d-78cc-4ccc-92d4-c2cc2cefd22f", name: "Tacuari" },
];

export default function ReportsPage() {
  // KPIs que mostramos
  const [kpis, setKpis] = useState({
    totalAmount: 0,
    tickets: 0,
    avgTicket: 0,
  });
  const [loadingKpis, setLoadingKpis] = useState(false);

  const today = new Date();

  // Rango de fechas (por defecto todo el mes actual)
  const [range, setRange] = useState<RDPDateRange | undefined>({
    from: new Date(today.getFullYear(), today.getMonth(), 1),
    to: new Date(today.getFullYear(), today.getMonth() + 1, 0),
  });

  // sucursales y filas
  const [stores] = useState<Store[]>(MOCK_STORES);
  const [rowsAll, setRowsAll] = useState<Row[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);

  // 🔥 Cargar KPIs + tabla desde la API
  async function loadSummary() {
    try {
      setLoadingKpis(true);

      const fromStr = range?.from ? formatDate(range.from) : null;
      let toStr = range?.to ? formatDate(range.to) : null;

      // ⚠️ Si el usuario selecciona solo un día, usamos el mismo para `to`
      if (!toStr && fromStr) {
        toStr = fromStr;
      }

      const params = new URLSearchParams();
      if (fromStr) params.append("from", fromStr);
      if (toStr) params.append("to", toStr);
      if (selectedStore) params.append("store_id", selectedStore);

      const res = await fetch(`/api/reports/summary?${params.toString()}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Error HTTP ${res.status}`);
      }

      const data = await res.json();
      console.log("SUMMARY RESPONSE:", data);

      // KPIs desde la API (ya vienen filtrados por rango + sucursal)
      if (data.kpis) {
        setKpis({
          totalAmount: Number(data.kpis.totalAmount ?? 0),
          tickets: Number(data.kpis.tickets ?? 0),
          avgTicket: Number(data.kpis.avgTicket ?? 0),
        });
      } else {
        setKpis({ totalAmount: 0, tickets: 0, avgTicket: 0 });
      }

      // filas
      if (Array.isArray(data.rows)) {
        setRowsAll(data.rows as Row[]);
      } else {
        setRowsAll([]);
      }
    } catch (err) {
      console.error("Error cargando reportes", err);
      alert("Error cargando datos del reporte");
    } finally {
      setLoadingKpis(false);
    }
  }

  // Ejecutar cuando cambia el rango O la sucursal
  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, selectedStore]);

  // Las filas que usamos en tabla (ya vienen filtradas en la API por sucursal,
  // pero si quisieras podrías volver a filtrar acá)
  const rows = rowsAll;

  // Agrupado por día y sucursal
  const byDay: ByDay = useMemo(() => {
    const map: ByDay = {};
    for (const r of rows) {
      const day = r.day;
      const storeName =
        stores.find((st) => st.id === r.store_id)?.name ||
        r.store_id ||
        "Sin sucursal";

      if (!map[day]) map[day] = {};
      map[day][storeName] = (map[day][storeName] || 0) + getRevenue(r);
    }
    return map;
  }, [rows, stores]);

  const days = Object.keys(byDay).sort();

  return (
    <main className="p-4 space-y-6">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold">Reportes</h1>
        <p className="max-w-2xl text-sm text-neutral-600">
          Consulta ingresos por sucursal y rango de fechas. Los KPIs y la tabla se actualizan automáticamente según tu selección.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(380px,1fr)_minmax(480px,1fr)]">
        {/* Selector de rango */}
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

        {/* KPIs + selector de sucursal */}
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
                onChange={(e) =>
                  setSelectedStore(
                    e.target.value === "" ? null : e.target.value
                  )
                }
              >
                <option value="">Todas</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4">
            {/* Ingresos */}
            <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Ingresos</div>
              <div className="mt-2 text-2xl font-semibold text-black">
                {loadingKpis
                  ? "Cargando..."
                  : `$${kpis.totalAmount.toLocaleString("es-AR")}`}
              </div>
            </div>

            {/* Tickets */}
            <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Tickets</div>
              <div className="mt-2 text-2xl font-semibold text-black">
                {loadingKpis ? "Cargando..." : kpis.tickets}
              </div>
            </div>

            {/* Ticket Promedio */}
            <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Ticket Prom.</div>
              <div className="mt-2 text-2xl font-semibold text-black">
                {loadingKpis
                  ? "Cargando..."
                  : `$${kpis.avgTicket.toLocaleString("es-AR")}`}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tabla por día y sucursal */}
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
                    $
                    {Number(byDay[d][sn] ?? 0).toLocaleString("es-AR", {
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
