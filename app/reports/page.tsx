'use client';

import React, { useMemo, useState, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import type { DateRange as RDPDateRange } from "react-day-picker";
import "react-day-picker/dist/style.css";

/** Tipos únicos (sin duplicados) */
export type Store = { id: string; name: string };
export type Row = {
  day: string;
  store_id: string | null;
  tickets: number;
  revenue: number;
};

/** Helpers bien tipados */
type ByDay = Record<string, Record<string, number>>;
const n = (v: unknown): number =>
  typeof v === "number" && isFinite(v) ? v : Number(v) || 0;
const s = (v: unknown): string => (v == null ? "" : String(v));

/** Mock mínimo para no romper el build si aún no hay DB */
const MOCK_STORES: Store[] = [
  { id: "alberdi", name: "Alberdi" },
  { id: "sanmartin", name: "Av. San Martín" },
  { id: "tacuari", name: "Tacuari" },
];

export default function ReportsPage() {
  // 📌 KPIs del reporte
  const [kpis, setKpis] = useState({
    totalAmount: 0,
    tickets: 0,
    avgTicket: 0,
  });
  const [loadingKpis, setLoadingKpis] = useState(false);

  const today = new Date();

  // Rango de fechas
  const [range, setRange] = useState<RDPDateRange | undefined>({
    from: new Date(today.getFullYear(), today.getMonth(), 1),
    to: new Date(today.getFullYear(), today.getMonth() + 1, 0),
  });

  // Sucursales y tabla
  const [stores] = useState<Store[]>(MOCK_STORES);
  const [rowsAll, setRowsAll] = useState<Row[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);

  // 🔥 CARGAR KPI + TABLA DESDE LA API
  async function loadSummary() {
    try {
      setLoadingKpis(true);

      // preparar fechas en formato YYYY-MM-DD
      const from = range?.from
        ? range.from.toISOString().split("T")[0]
        : "";
      const to = range?.to ? range.to.toISOString().split("T")[0] : "";
      const storeId = selectedStore ?? "";

      // llamar a /api/reports/summary
      const res = await fetch(
        `/api/reports/summary?from=${from}&to=${to}&store_id=${storeId}`,
        { cache: "no-store" }
      );

      if (!res.ok) {
        throw new Error("Error en la respuesta del servidor");
      }

      const data = await res.json();
      console.log("SUMMARY RESPONSE:", data);

      // actualizar KPIs (según lo que devuelva tu API)
      setKpis({
        totalAmount: n(data.totalAmount),
        tickets: n(data.tickets),
        avgTicket: n(data.avgTicket),
      });

      // actualizar filas (tabla)
      if (data.rows) {
        setRowsAll(data.rows as Row[]);
      }
    } catch (err) {
      console.error("Error cargando reportes", err);
      alert("Error cargando datos del reporte");
    } finally {
      setLoadingKpis(false);
    }
  }

  // Ejecutar carga del reporte cuando cambia fecha o sucursal
  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, selectedStore]);

  // Filas filtradas por fecha + sucursal
  const rows = useMemo<Row[]>(() => {
    if (!rowsAll || rowsAll.length === 0) return [];

    // si no hay rango, devolvemos todo pero filtrando por sucursal
    if (!range?.from || !range?.to) {
      return rowsAll.filter((row) => {
        const matchesStore =
          !selectedStore || row.store_id === selectedStore;
        return matchesStore;
      });
    }

    // Filtrar por rango de fechas + sucursal
    return rowsAll.filter((row) => {
      const d = new Date(row.day); // usamos day, no date
      const inRange = d >= range.from! && d <= range.to!;
      const matchesStore =
        !selectedStore || row.store_id === selectedStore;
      return inRange && matchesStore;
    });
  }, [rowsAll, range, selectedStore]);

  // KPI agregados desde rows (por si los querés usar también)
  const totalRevenue = useMemo(
    () => rows.reduce((a, b) => a + n(b.revenue), 0),
    [rows]
  );

  const totalTickets = useMemo(
    () => rows.reduce((a, b) => a + n(b.tickets), 0),
    [rows]
  );

  const avgTicket = totalTickets ? totalRevenue / totalTickets : 0;

  // Tabla por día y sucursal
  const byDay: ByDay = useMemo(() => {
    const map: ByDay = {};
    for (const r of rows) {
      const day = r.day;
      const storeName =
        stores.find((st) => st.id === r.store_id)?.name ||
        r.store_id ||
        "Todas";

      map[day] = map[day] || {};
      map[day][storeName] =
        (map[day][storeName] || 0) + n(r.revenue);
    }
    return map;
  }, [rows, stores]);

  const days = Object.keys(byDay).sort();

  return (
    <main className="p-4 space-y-6">
      <h1 className="text-2xl font-semibold">Reportes</h1>

      <section className="grid gap-4 md:grid-cols-2">
        {/* Selector de rango */}
        <div className="rounded-xl border p-4">
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

        {/* KPIs del reporte */}
        <div className="rounded-xl border p-4">
          <h2 className="font-medium mb-4">KPIs</h2>

          <div className="grid grid-cols-3 gap-4">
            {/* Ingresos */}
            <div className="rounded-lg border p-3">
              <div className="text-sm text-neutral-500">Ingresos</div>
              <div className="text-2xl font-bold">
                {loadingKpis
                  ? "Cargando..."
                  : `$${kpis.totalAmount.toLocaleString("es-AR")}`}
              </div>
            </div>

            {/* Tickets */}
            <div className="rounded-lg border p-3">
              <div className="text-sm text-neutral-500">Tickets</div>
              <div className="text-2xl font-bold">
                {loadingKpis ? "Cargando..." : kpis.tickets}
              </div>
            </div>

            {/* Ticket Promedio */}
            <div className="rounded-lg border p-3">
              <div className="text-sm text-neutral-500">Ticket Prom.</div>
              <div className="text-2xl font-bold">
                {loadingKpis
                  ? "Cargando..."
                  : `$${kpis.avgTicket.toLocaleString("es-AR")}`}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tabla por día y sucursal */}
      <section className="rounded-xl border p-4 overflow-x-auto">
        <h2 className="font-medium mb-3">Ingresos por día y sucursal</h2>
        <table className="min-w-[600px] w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Día</th>
              <th className="py-2 pr-4">Sucursal</th>
              <th className="py-2 pr-4">Ingresos</th>
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
                    ${Number(byDay[d][sn] || 0).toFixed(2)}
                  </td>
                </tr>
              ));
            })}
            {!days.length && (
              <tr>
                <td
                  colSpan={3}
                  className="py-6 text-center text-neutral-500"
                >
                  Sin datos en el rango seleccionado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
