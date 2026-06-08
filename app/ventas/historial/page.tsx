"use client";

import { useEffect, useMemo, useState } from "react";
import { getPosEmployee } from "@/lib/posSession";
import { STORES as ALL_STORES } from "@/lib/stores";

const STORES = ALL_STORES.map((s) => ({ id: s.id, name: s.short }));

const METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  debito: "Débito",
  credito: "Crédito",
  mp: "Mercado Pago",
  cuenta_corriente: "Cuenta corriente",
  mixto: "Mixto",
};

type SaleRow = {
  id: string;
  created_at: string;
  total: number;
  store_id: string | null;
  register_id: string | null;
  method: string;
};

type SaleItem = {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
};

type Register = { id: string; name: string };

function formatMoney(n: number) {
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function todayStr() {
  const d = new Date();
  return d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
    .split("/")
    .reverse()
    .map((p) => p.padStart(2, "0"))
    .join("-");
}

export default function SalesHistorialPage() {
  const [ready, setReady] = useState(false);
  const [isSupervisor, setIsSupervisor] = useState(false);

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [registerMap, setRegisterMap] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterStore, setFilterStore] = useState("");
  const [filterRegister, setFilterRegister] = useState("");
  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsCache, setItemsCache] = useState<Record<string, SaleItem[]>>({});
  const [itemsLoading, setItemsLoading] = useState<string | null>(null);

  useEffect(() => {
    const emp = getPosEmployee();
    setIsSupervisor(emp?.role === "supervisor");
    setReady(true);
  }, []);

  async function loadRegisters(storeId?: string) {
    try {
      const { supabase } = await import("@/lib/supabase");
      let q = supabase.from("registers").select("id,name").order("name");
      if (storeId) q = q.eq("store_id", storeId);
      const { data } = await q;
      const list = (data ?? []) as Register[];
      setRegisters(list);
      const map: Record<string, string> = {};
      for (const r of list) map[r.id] = r.name;
      setRegisterMap(map);
    } catch {
      setRegisters([]);
      setRegisterMap({});
    }
  }

  async function loadSales() {
    try {
      setLoading(true);
      setError(null);
      const sp = new URLSearchParams();
      if (filterStore) sp.set("store_id", filterStore);
      if (filterRegister) sp.set("register_id", filterRegister);
      if (fromDate) sp.set("from", fromDate);
      if (toDate) sp.set("to", toDate);
      const res = await fetch(`/api/sales?${sp.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Error al cargar ventas");
      setSales(
        (json.data ?? []).map((r: any) => ({
          id: r.id,
          created_at: r.created_at,
          total: Number(r.total ?? 0),
          store_id: r.store_id ?? null,
          register_id: r.register_id ?? null,
          method: r.payment?.method ?? "desconocido",
        }))
      );
    } catch (e: any) {
      setError(e?.message ?? "Error inesperado");
      setSales([]);
    } finally {
      setLoading(false);
    }
  }

  async function toggleExpand(saleId: string) {
    if (expandedId === saleId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(saleId);
    if (itemsCache[saleId]) return;
    try {
      setItemsLoading(saleId);
      const res = await fetch(`/api/sales/items?sale_id=${saleId}`, { cache: "no-store" });
      const json = await res.json();
      setItemsCache((prev) => ({ ...prev, [saleId]: json.data ?? [] }));
    } catch {
      setItemsCache((prev) => ({ ...prev, [saleId]: [] }));
    } finally {
      setItemsLoading(null);
    }
  }

  useEffect(() => {
    setFilterRegister("");
    void loadRegisters(filterStore || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStore]);

  useEffect(() => {
    if (ready && isSupervisor) void loadSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isSupervisor]);

  const summary = useMemo(() => {
    const total = sales.reduce((acc, s) => acc + s.total, 0);
    return { count: sales.length, total };
  }, [sales]);

  const storeName = (id: string | null) => {
    if (!id) return "—";
    return STORES.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  };

  if (!ready) return null;

  if (!isSupervisor) {
    return (
      <main className="p-4">
        <div className="rounded-xl border p-6 text-center text-sm text-neutral-500">
          Esta página es solo para supervisores.
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Historial de ventas</h1>
          <p className="text-sm text-neutral-500">Todas las ventas confirmadas, ticket a ticket.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={loadSales}
            disabled={loading}
            className="rounded-lg border px-4 py-2 text-sm font-medium bg-neutral-900 text-white disabled:opacity-50"
          >
            {loading ? "Cargando..." : "Buscar"}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <section className="rounded-xl border p-4 bg-white grid gap-3 md:grid-cols-4">
        <div className="flex flex-col text-sm">
          <label className="text-neutral-500 mb-1">Sucursal</label>
          <select
            className="rounded border px-2 py-2 text-sm"
            value={filterStore}
            onChange={(e) => setFilterStore(e.target.value)}
          >
            <option value="">Todas</option>
            {STORES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
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
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col text-sm">
          <label className="text-neutral-500 mb-1">Desde</label>
          <input
            type="date"
            className="rounded border px-2 py-2 text-sm"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div className="flex flex-col text-sm">
          <label className="text-neutral-500 mb-1">Hasta</label>
          <input
            type="date"
            className="rounded border px-2 py-2 text-sm"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
      </section>

      {/* Resumen */}
      <section className="rounded-xl border p-4 bg-white grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-xs text-neutral-500">Tickets encontrados</div>
          <div className="text-xl font-semibold">{summary.count}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Total ventas</div>
          <div className="text-xl font-semibold">{formatMoney(summary.total)}</div>
        </div>
      </section>

      {/* Tabla */}
      <section className="rounded-xl border p-4">
        {error && <p className="mb-3 text-sm text-red-600">Error: {error}</p>}
        {loading ? (
          <p className="text-sm text-neutral-500">Cargando ventas…</p>
        ) : sales.length === 0 ? (
          <p className="text-sm text-neutral-500">No hay ventas con esos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b bg-neutral-50">
                  <th className="text-left py-2 px-2 w-4"></th>
                  <th className="text-left py-2 px-2">Fecha y hora</th>
                  <th className="text-left py-2 px-2">Sucursal</th>
                  <th className="text-left py-2 px-2">Caja</th>
                  <th className="text-right py-2 px-2">Total</th>
                  <th className="text-left py-2 px-2">Método</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => {
                  const isExpanded = expandedId === s.id;
                  const items = itemsCache[s.id];
                  return (
                    <>
                      <tr
                        key={s.id}
                        className="border-b last:border-0 cursor-pointer hover:bg-neutral-50"
                        onClick={() => toggleExpand(s.id)}
                      >
                        <td className="py-1 px-2 text-neutral-400">
                          {isExpanded ? "▼" : "▶"}
                        </td>
                        <td className="py-1 px-2">{formatDateTime(s.created_at)}</td>
                        <td className="py-1 px-2">{storeName(s.store_id)}</td>
                        <td className="py-1 px-2">
                          {s.register_id ? registerMap[s.register_id] ?? "Caja" : "—"}
                        </td>
                        <td className="py-1 px-2 text-right font-medium">{formatMoney(s.total)}</td>
                        <td className="py-1 px-2">{METHOD_LABELS[s.method] ?? s.method}</td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${s.id}-items`} className="bg-blue-50 border-b">
                          <td></td>
                          <td colSpan={5} className="py-2 px-4">
                            {itemsLoading === s.id ? (
                              <span className="text-neutral-400">Cargando productos…</span>
                            ) : !items || items.length === 0 ? (
                              <span className="text-neutral-400">Sin detalle de productos.</span>
                            ) : (
                              <table className="min-w-full text-xs">
                                <thead>
                                  <tr className="text-neutral-500">
                                    <th className="text-left py-1 pr-4">Producto</th>
                                    <th className="text-right py-1 pr-4">Cant.</th>
                                    <th className="text-right py-1 pr-4">Precio unit.</th>
                                    <th className="text-right py-1">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((item) => (
                                    <tr key={item.product_id}>
                                      <td className="py-0.5 pr-4">{item.name}</td>
                                      <td className="py-0.5 pr-4 text-right">{item.quantity}</td>
                                      <td className="py-0.5 pr-4 text-right">{formatMoney(item.unit_price)}</td>
                                      <td className="py-0.5 text-right">{formatMoney(item.quantity * item.unit_price)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
