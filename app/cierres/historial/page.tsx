"use client";

import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { auditActionLabel, formatAuditDate, parseAuditNotes, shortId } from "@/lib/auditNotes";

type Store = { id: string; name: string };
type Register = { id: string; name: string; store_id?: string | null };

const STORES: Store[] = [
  ...require("@/lib/stores").STORES.map((s: any) => ({ id: s.id, name: s.short })),
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
  notes: string | null;
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

function AuditCell({ notes }: { notes: string | null }) {
  const audit = parseAuditNotes(notes);
  const total = audit.entries.length + audit.legacy.length;
  if (total === 0) return <span className="text-neutral-400">—</span>;

  return (
    <details className="min-w-[220px]">
      <summary className="cursor-pointer text-xs font-medium text-blue-700">
        Ver auditoría ({total})
      </summary>
      <div className="mt-2 space-y-2 rounded-lg border bg-white p-2 text-[11px] text-neutral-700 shadow-sm">
        {audit.legacy.map((line, idx) => (
          <p key={`legacy-${idx}`} className="text-neutral-500">{line}</p>
        ))}
        {audit.entries.map((entry, idx) => (
          <div key={idx} className="rounded-md bg-neutral-50 p-2">
            <div className="font-semibold">{auditActionLabel(entry.action)} · {formatAuditDate(entry.at)}</div>
            <div>Empleado: {shortId(entry.by)} {entry.role ? `(${entry.role})` : ""}</div>
            <div>Caja: {shortId(entry.register)} · Sucursal: {shortId(entry.store)}</div>
            {entry.reason && <div>Motivo: {entry.reason}</div>}
          </div>
        ))}
      </div>
    </details>
  );
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
        notes: r.notes ? String(r.notes) : null,
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
      toast.error("La fecha 'Desde' es inválida.");
      return;
    }
    if (toDate && !isYmd(toDate)) {
      toast.error("La fecha 'Hasta' es inválida.");
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      toast.error("'Desde' no puede ser mayor que 'Hasta'.");
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

  async function exportToExcel() {
    const XLSX = await import("xlsx");
    const wsData: (string | number)[][] = [
      ["Fecha", "Sucursal", "Caja", "Total ventas", "Efectivo", "Tickets", "Hora de cierre"],
      ...rows.map((r) => [
        formatDate(r.date),
        storeName(r.store_id),
        r.register_id ? registerMap[r.register_id] ?? "Caja" : "—",
        r.total_sales,
        r.total_cash,
        r.total_tickets,
        r.closed_at ? formatTime(r.closed_at) : "—",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historial cierres");
    XLSX.writeFile(wb, `historial-cierres-${new Date().toISOString().slice(0, 10)}.xlsx`);
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

	  const scopeLabel = [
	    filterStore ? storeName(filterStore) : "todas las sucursales",
	    filterRegister ? registerMap[filterRegister] ?? "caja seleccionada" : "todas las cajas",
	    fromDate || toDate ? `${fromDate || "inicio"} a ${toDate || "hoy"}` : "todas las fechas",
	  ].join(" · ");

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

          <button
            onClick={exportToExcel}
            disabled={rows.length === 0}
            className="rounded-lg border px-4 py-2 text-sm font-medium bg-emerald-700 text-white disabled:opacity-50"
          >
            Exportar Excel
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

	      <section className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
	        Mostrando <span className="font-semibold">{scopeLabel}</span>.
	        {!filterStore && !filterRegister && !fromDate && !toDate && (
	          <span> Aplicá filtros para auditar una caja o una fecha puntual.</span>
	        )}
	      </section>

	      {/* Resumen */}
      <section className="rounded-xl border p-4 bg-white grid gap-3 md:grid-cols-4">
        <div>
          <div className="text-xs text-neutral-500">Cierres</div>
          <div className="text-xl font-semibold">
            {loading ? <div className="h-6 w-12 animate-pulse rounded bg-neutral-200" /> : summary.closures}
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Tickets</div>
          <div className="text-xl font-semibold">
            {loading ? <div className="h-6 w-12 animate-pulse rounded bg-neutral-200" /> : summary.totalTickets}
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Total ventas</div>
          <div className="text-xl font-semibold">
            {loading ? <div className="h-6 w-24 animate-pulse rounded bg-neutral-200" /> : formatMoney(summary.totalSales)}
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Total efectivo</div>
          <div className="text-xl font-semibold">
            {loading ? <div className="h-6 w-24 animate-pulse rounded bg-neutral-200" /> : formatMoney(summary.totalCash)}
          </div>
        </div>
      </section>

      {/* Tabla */}
      <section className="rounded-xl border p-4">
        {error && <p className="mb-3 text-sm text-red-600">Error: {error}</p>}

        {loading && rows.length === 0 ? (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="h-4 bg-neutral-200 rounded w-20" />
                <div className="h-4 bg-neutral-200 rounded flex-1" />
                <div className="h-4 bg-neutral-200 rounded flex-1" />
                <div className="h-4 bg-neutral-200 rounded w-24" />
                <div className="h-4 bg-neutral-200 rounded w-24" />
                <div className="h-4 bg-neutral-200 rounded w-12" />
                <div className="h-4 bg-neutral-200 rounded w-16" />
              </div>
            ))}
          </div>
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
                  <th className="text-left py-2 px-2">Auditoría</th>
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
                    <td className="py-1 px-2"><AuditCell notes={r.notes} /></td>
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
