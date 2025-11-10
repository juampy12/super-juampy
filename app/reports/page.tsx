'use client';

import React, { useMemo, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import type { DateRange as RDPDateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

/** Tipos únicos (sin duplicados) */
export type Store = { id: string; name: string };
export type Row = { day: string; store_id: string | null; tickets: number; revenue: number };

/** Helpers bien tipados */
type ByDay = Record<string, Record<string, number>>;
const n = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
const s = (v: unknown): string => (v == null ? '' : String(v));

/** Mock mínimo para no romper el build si aún no hay DB */
const MOCK_STORES: Store[] = [
  { id: 'alberdi', name: 'Alberdi' },
  { id: 'sanmartin', name: 'Av. San Martín' },
  { id: 'tacuari', name: 'Tacuari' },
];

const today = new Date();

export default function ReportsPage() {
  // Rango de fechas (RDPDateRange), by default el mes actual
  const [range, setRange] = useState<RDPDateRange | undefined>({
    from: new Date(today.getFullYear(), today.getMonth(), 1),
    to: new Date(today.getFullYear(), today.getMonth() + 1, 0),
  });

  // fuente de datos (por ahora mock; cuando conectes, reemplazá rowsAll por lo que venga de Supabase)
  const [stores] = useState<Store[]>(MOCK_STORES);
  const [rowsAll] = useState<Row[]>([
    { day: '2025-10-01', store_id: 'alberdi', revenue: 125000, tickets: 210 },
    { day: '2025-10-01', store_id: 'sanmartin', revenue: 98000, tickets: 180 },
    { day: '2025-10-02', store_id: 'alberdi', revenue: 132000, tickets: 220 },
    { day: '2025-10-02', store_id: 'tacuari', revenue: 76000, tickets: 140 },
  ]);

  // Filtro por rango
  const rows = useMemo<Row[]>(() => {
    if (!range?.from || !range?.to) return rowsAll;
    const from = range.from.setHours(0, 0, 0, 0);
    const to = range.to.setHours(23, 59, 59, 999);
    return rowsAll.filter((r) => {
      const d = new Date(r.day).getTime();
      return d >= from && d <= to;
    });
  }, [range, rowsAll]);

  // KPI agregados
  const totalRevenue = useMemo<number>(
    () => rows.reduce<number>((a, b) => a + n(b.revenue), 0),
    [rows]
  );
  const totalTickets = useMemo<number>(
    () => rows.reduce<number>((a, b) => a + n(b.tickets), 0),
    [rows]
  );
  const avgTicket = totalTickets ? totalRevenue / totalTickets : 0;

  // Tabla por día y sucursal (simple)
  const byDay: ByDay = useMemo(() => {
    const map: ByDay = {};
    for (const r of rows) {
      const day = r.day;
      const storeName = s(stores.find((st) => st.id === r.store_id)?.name ?? r.store_id ?? 'Todas');
      map[day] = map[day] || {};
      map[day][storeName] = (map[day][storeName] || 0) + n(r.revenue);
    }
    return map;
  }, [rows, stores]);

  const days = Object.keys(byDay).sort();

  return (
    <main className="p-4 space-y-6">
      <h1 className="text-2xl font-semibold">Reportes</h1>

      <section className="grid gap-4 md:grid-cols-2">
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

        <div className="rounded-xl border p-4">
          <h2 className="font-medium mb-4">KPIs</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border p-3">
              <div className="text-sm text-neutral-500">Ingresos</div>
              <div className="text-2xl font-bold">${(Number(totalRevenue) || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-sm text-neutral-500">Tickets</div>
              <div className="text-2xl font-bold">{Number(totalTickets) || 0}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-sm text-neutral-500">Ticket Prom.</div>
              <div className="text-2xl font-bold">${(Number(avgTicket) || 0).toFixed(2)}</div>
            </div>
          </div>
        </div>
      </section>

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
                  <td className="py-2 pr-4">{i === 0 ? d : ''}</td>
                  <td className="py-2 pr-4">{sn}</td>
                  <td className="py-2 pr-4">${(Number(byDay[d][sn]) || 0).toFixed(2)}</td>
                </tr>
              ));
            })}
            {!days.length && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-neutral-500">
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
