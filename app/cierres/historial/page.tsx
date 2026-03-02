"use client";

import React, { useEffect, useMemo, useState } from "react";

type Store = { id: string; name: string };
type Register = { id: string; name: string; store_id?: string | null };

const STORES: Store[] = [
  { id: "06ca13ff-d96d-4670-84d7-41057b3f6bc7", name: "Av. San Martín" },
  { id: "914dee4d-a78c-4f3f-8998-402c56fc88e9", name: "Alberdi" },
  { id: "fb38a57d-78cc-4ccc-92d4-c2cc2cefd22f", name: "Tacuari" },
];

type ClosureRow = {
  id: string;
  store_id: string | null;
  register_id: string | null;
  date: string; // YYYY-MM-DD
  closed_at: string | null; // ISO
  total_sales: number;
  total_tickets: number;
  total_cash: number;
};

function formatMoney(n: number) {
  return `$${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(dateStr: string) {
  if (!dateStr) return "-";

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (m) {
    const [, y, mo, d] = m;
    return `${d}/${mo}/${y}`;
  }

  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("es-AR");
}

function formatTime(dateStr: string | null) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function storeName(storeId: string | null) {
  if (!storeId) return "—";
  const s = STORES.find((st) => st.id === storeId);
  return s?.name ?? storeId.slice(0, 8);
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default function CashClosuresHistoryPage() {
  const [rowsAll, setRowsAll] = useState<ClosureRow[]>([]);
  const [registerMap, setRegisterMap] = useState<Record<string, string>>({});
  const [registers, setRegisters] = useState<Register[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // filtros
  const [filterStore, setFilterStore] = useState("");
  const [filterRegister, setFilterRegister] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  async function loadRegisters(storeId?: string) {
    try {
      const { supabase } = await import("@/lib/supabase");

      let q = supabase.from("registers").select("id,name,store_id").order("name", { ascending: true });
      if (storeId) q = q.eq("store_id", storeId);

      const { data, error } = await q;
      if (error) throw error;

      const list = (data ?? []) as Register[];
      setRegisters(list);

      const map: Record<string, string> = {};
      for (const r of list) map[r.id] = r.name;
      setRegisterMap(map);

      return list;
    } catch (e) {
      console.error("Error cargando cajas", e);
      setRegisters([]);
      setRegisterMap({});
      return [];
    }
  }

  async function loadClosures(params?: { store_id?: string; register_id?: string }) {
    try {
      setLoading(true);
      setError(null);

      const sp = new URLSearchParams();
      if (params?.store_id) sp.append("store_id", params.store_id);
      if (params?.register_id) sp.append("register_id", params.register_id);

      const url = sp.toString().length > 0 ? `/api/cash-closures?${sp.toString()}` : "/api/cash-closures";

      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error ?? "Error al cargar los cierres de caja");
      }

      const list = Array.isArray(json?.data) ? json.data : [];

      const mapped: ClosureRow[] = list.map((r: any) => ({
        id: String(r.id),
        store_id: r.store_id ? String(r.store_id) : null,
        register_id: r.register_id ? String(r.register_id) : null,
        date: String(r.date),
        closed_at: r.closed_at ? String(r.closed_at) : null,
        total_sales: Number(r.total_sales ?? 0),
        total_tickets: Number(r.total_tickets ?? 0),
        total_cash: Number(r.total_cash ?? 0),
      }));

      setRowsAll(mapped);
    } catch (err: any) {
      console.error("Error cargando historial de cierres", err);
      setError(err?.message ?? "Error al cargar los cierres de caja");
      setRowsAll([]);
    } finally {
      setLoading(false);
    }
  }

  async function applyFilters() {
    // validación básica de fechas
    if (fromDate && !isYmd(fromDate)) {
      alert("La fecha 'Desde' es inválida.");
      return;
    }
    if (toDate && !isYmd(toDate)) {
      alert("La fecha 'Hasta' es inválida.");
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      alert("'Desde' no puede ser mayor que 'Hasta'.");
      return;
    }

    // asegurar que la caja seleccionada existe dentro del listado actual de registros
    // (si filtraste por sucursal, este listado es por sucursal)
    const currentRegisters = registers;
    const validRegister = filterRegister ? currentRegisters.some((r) => r.id === filterRegister) : true;

    const safeRegister = validRegister ? filterRegister : "";
    if (filterRegister && !validRegister) {
      setFilterRegister("");
    }

    await loadClosures({
      store_id: filterStore || undefined,
      register_id: safeRegister || undefined,
    });
  }

  async function clearFilters() {
    setFilterStore("");
    setFilterRegister("");
    setFromDate("");
    setToDate("");

    await loadRegisters(undefined);
    await loadClosures();
  }

  // init
  useEffect(() => {
    void (async () => {
      await loadRegisters(undefined);
      await loadClosures();
    })();
  }, []);

  // cuando cambia sucursal: reset caja + recarga cajas
  useEffect(() => {
    setFilterRegister("");
    void loadRegisters(filterStore || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStore]);

  const rows = useMemo(() => {
    let out = [...rowsAll];

    if (fromDate && isYmd(fromDate)) out = out.filter((r) => r.date >= fromDate);
    if (toDate && isYmd(toDate)) out = out.filter((r) => r.date <= toDate);

    out.sort((a, b) => {
      const d = String(b.date).localeCompare(String(a.date));
      if (d !== 0) return d;
      return String(b.closed_at ?? "").localeCompare(String(a.closed_at ?? ""));
    });

    return out;
  }, [rowsAll, fromDate, toDate]);

  const summary = useMemo(() => {
    const closures = rows.length;
    const totalSales = rows.reduce((acc, r) => acc + r.total_sales, 0);
    const totalCash = rows.reduce((acc, r) => acc + r.total_cash, 0);
    const totalTickets = rows.reduce((acc, r) => acc + r.total_tickets, 0);
    return { closures, totalSales, totalCash, totalTickets };
  }, [rows]);

  return (
    <main className="p-4 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Historial de cierres</h1>
          <p className="text-sm text-neutral-500">Listado de cierres de caja por fecha, sucursal y caja.</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={applyFilters}
            disabled={loading}
            className="rounded-lg border px-4 py-2 text-sm font-medium bg-neutral-900 text-white disabled:opacity-50"
          >
            Aplicar
          </button>

          <button
            onClick={clearFilters}
            disabled={loading}
            className="rounded-lg border px-4 py-2 text-sm font-medium bg-white disabled:opacity-50"
          >
            Limpiar
          </button>

          <button
            onClick={() =>
              loadClosures({
                store_id: filterStore || undefined,
                register_id: filterRegister || undefined,
              })
            }
            disabled={loading}
            className="rounded-lg border px-4 py-2 text-sm font-medium bg-neutral-800 text-white disabled:opacity-50"
          >
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <section className="rounded-xl border p-4 bg-white grid gap-3 md:grid-cols-4">
        <div className="flex flex-col text-sm">
          <label className="text-neutral-500 mb-1">Sucursal</label>
          <select className="rounded border px-2 py-2 text-sm" value={filterStore} onChange={(e) => setFilterStore(e.target.value)}>
            <option value="">Todas</option>
            {STORES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col text-sm">
          <label className="text-neutral-500 mb-1">Caja</label>
          <select
            className="rounded border px-2 py-2 text-sm"
            value={filterRegister}
            onChange={(e) => setFilterRegister(e.target.value)}
            disabled={registers.length === 0}
          >
            <option value="">Todas</option>
            {registers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col text-sm">
          <label className="text-neutral-500 mb-1">Desde</label>
          <input type="date" className="rounded border px-2 py-2 text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>

        <div className="flex flex-col text-sm">
          <label className="text-neutral-500 mb-1">Hasta</label>
          <input type="date" className="rounded border px-2 py-2 text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </section>

      {/* Resumen */}
      <section className="rounded-xl border p-4 bg-white grid gap-3 md:grid-cols-4">
        <div>
          <div className="text-xs text-neutral-500">Cierres</div>
          <div className="text-xl font-semibold">{summary.closures}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Tickets</div>
          <div className="text-xl font-semibold">{summary.totalTickets}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Total ventas</div>
          <div className="text-xl font-semibold">{formatMoney(summary.totalSales)}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Total efectivo</div>
          <div className="text-xl font-semibold">{formatMoney(summary.totalCash)}</div>
        </div>
      </section>

      {/* Tabla */}
      <section className="rounded-xl border p-4">
        {error && <p className="mb-3 text-sm text-red-600">Error: {error}</p>}

        {loading && rows.length === 0 ? (
          <p className="text-sm text-neutral-500">Cargando cierres…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-neutral-500">No hay cierres con esos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b bg-neutral-50">
                  <th className="text-left py-2 px-2">Fecha</th>
                  <th className="text-left py-2 px-2">Sucursal</th>
                  <th className="text-left py-2 px-2">Caja</th>
                  <th className="text-right py-2 px-2">Total ventas</th>
                  <th className="text-right py-2 px-2">Efectivo</th>
                  <th className="text-right py-2 px-2">Tickets</th>
                  <th className="text-left py-2 px-2">Hora de cierre</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-1 px-2">{formatDate(r.date)}</td>
                    <td className="py-1 px-2">{storeName(r.store_id)}</td>
                    <td className="py-1 px-2">{r.register_id ? registerMap[r.register_id] ?? "Caja" : "—"}</td>
                    <td className="py-1 px-2 text-right">{formatMoney(r.total_sales)}</td>
                    <td className="py-1 px-2 text-right">{formatMoney(r.total_cash)}</td>
                    <td className="py-1 px-2 text-right">{r.total_tickets}</td>
                    <td className="py-1 px-2">{formatTime(r.closed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
