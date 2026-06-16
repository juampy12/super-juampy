"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getPosEmployee } from "@/lib/posSession";
import { STORES as ALL_STORES } from "@/lib/stores";
import toast from "react-hot-toast";

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
  status: string;
  voided_at: string | null;
  voided_by: string | null;
  voided_by_role: string | null;
  void_authorized_by: string | null;
  void_authorized_code: string | null;
  void_authorized_name: string | null;
  void_reason: string | null;
  voided_from_register_id: string | null;
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

// ── Modal de anulación ────────────────────────────────────────────────────────

type VoidModalProps = {
  sale: SaleRow;
  onClose: () => void;
  onVoided: () => void;
};

function VoidModal({ sale, onClose, onVoided }: VoidModalProps) {
  const [supervisorCode, setSupervisorCode] = useState("900");
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supervisorCode.trim() || !pin.trim()) { setError("Ingresá código y PIN de supervisor"); return; }
    if (!reason.trim()) { setError("Ingresá el motivo de anulación"); return; }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sales/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sale_id: sale.id,
          supervisor_code: supervisorCode.trim(),
          pin: pin.trim(),
          reason: reason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Error al anular la venta");
        return;
      }
      toast.success("Venta anulada correctamente");
      onVoided();
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold mb-1">Anular venta</h2>
        <p className="text-sm text-neutral-500 mb-4">
          Esta acción devuelve el stock y marca la venta como anulada. No se puede deshacer.
        </p>

        <div className="rounded-xl border bg-neutral-50 p-3 mb-4 text-sm space-y-1">
          <div className="text-neutral-500 text-xs">Venta a anular</div>
          <div className="font-medium">{formatDateTime(sale.created_at)}</div>
          <div className="text-neutral-600">
            {STORES.find((s) => s.id === sale.store_id)?.name ?? "—"} &middot; {formatMoney(sale.total)}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">
              Código supervisor
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={supervisorCode}
              onChange={(e) => { setSupervisorCode(e.target.value); setError(null); }}
              className="w-full rounded-lg border px-3 py-2 text-center"
              placeholder="900"
              disabled={loading}
              maxLength={10}
              autoComplete="off"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">
              PIN supervisor
            </label>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(null); }}
              className="w-full rounded-lg border px-3 py-2 text-lg tracking-widest text-center"
              placeholder="••••"
              disabled={loading}
              maxLength={10}
              autoComplete="off"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">
              Motivo
            </label>
            <textarea
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(null); }}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Ej: producto duplicado, error de carga..."
              disabled={loading}
              maxLength={200}
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !supervisorCode.trim() || !pin.trim() || !reason.trim()}
              className="flex-1 rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? "Anulando…" : "Confirmar anulación"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

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

  const [voidTarget, setVoidTarget] = useState<SaleRow | null>(null);

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
          status: r.status ?? "confirmed",
            voided_at: r.payment?.voided_at ?? null,
            voided_by: r.payment?.voided_by ?? null,
            voided_by_role: r.payment?.voided_by_role ?? null,
            void_authorized_by: r.payment?.void_authorized_by ?? null,
            void_authorized_code: r.payment?.void_authorized_code ?? null,
            void_authorized_name: r.payment?.void_authorized_name ?? null,
            void_reason: r.payment?.void_reason ?? null,
            voided_from_register_id: r.payment?.voided_from_register_id ?? null,
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
    if (expandedId === saleId) { setExpandedId(null); return; }
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

  // KPIs solo sobre ventas confirmadas
  const summary = useMemo(() => {
    const confirmed = sales.filter((s) => s.status === "confirmed");
    return {
      count: confirmed.length,
      total: confirmed.reduce((acc, s) => acc + s.total, 0),
      anuladas: sales.length - confirmed.length,
    };
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
      {voidTarget && (
        <VoidModal
          sale={voidTarget}
          onClose={() => setVoidTarget(null)}
          onVoided={() => { setVoidTarget(null); void loadSales(); }}
        />
      )}

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Historial de ventas</h1>
          <p className="text-sm text-neutral-500">Todas las ventas confirmadas y anuladas, ticket a ticket.</p>
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

      {/* Resumen — solo confirmadas */}
      <section className="rounded-xl border p-4 bg-white grid gap-3 md:grid-cols-3">
        <div>
          <div className="text-xs text-neutral-500">Tickets confirmados</div>
          <div className="text-xl font-semibold">
            {loading ? <div className="h-6 w-12 animate-pulse rounded bg-neutral-200" /> : summary.count}
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Total confirmado</div>
          <div className="text-xl font-semibold">
            {loading ? <div className="h-6 w-28 animate-pulse rounded bg-neutral-200" /> : formatMoney(summary.total)}
          </div>
        </div>
        {summary.anuladas > 0 && (
          <div>
            <div className="text-xs text-neutral-500">Anuladas</div>
            <div className="text-xl font-semibold text-red-600">{summary.anuladas}</div>
          </div>
        )}
      </section>

      {/* Tabla */}
      <section className="rounded-xl border p-4">
        {error && <p className="mb-3 text-sm text-red-600">Error: {error}</p>}
        {loading ? (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="h-4 bg-neutral-200 rounded w-4 shrink-0" />
                <div className="h-4 bg-neutral-200 rounded flex-1" />
                <div className="h-4 bg-neutral-200 rounded w-20" />
                <div className="h-4 bg-neutral-200 rounded w-16" />
                <div className="h-4 bg-neutral-200 rounded w-20" />
                <div className="h-4 bg-neutral-200 rounded w-20" />
                <div className="h-4 bg-neutral-200 rounded w-16" />
              </div>
            ))}
          </div>
        ) : sales.length === 0 ? (
          <p className="text-sm text-neutral-500">No hay ventas con esos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[700px] text-xs">
              <thead>
                <tr className="border-b bg-neutral-50">
                  <th className="text-left py-2 px-2 w-4"></th>
                  <th className="text-left py-2 px-2">Fecha y hora</th>
                  <th className="text-left py-2 px-2">Sucursal</th>
                  <th className="text-left py-2 px-2">Caja</th>
                  <th className="text-right py-2 px-2">Total</th>
                  <th className="text-left py-2 px-2">Método</th>
                  <th className="text-left py-2 px-2">Estado</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => {
                  const isVoided = s.status === "anulada";
                  const isExpanded = expandedId === s.id;
                  const items = itemsCache[s.id];
                  return (
                    <React.Fragment key={s.id}>
                      <tr
                        className={`border-b last:border-0 cursor-pointer hover:bg-neutral-50 ${isVoided ? "opacity-60" : ""}`}
                        onClick={() => toggleExpand(s.id)}
                      >
                        <td className="py-1 px-2 text-neutral-400">
                          {isExpanded ? "▼" : "▶"}
                        </td>
                        <td className={`py-1 px-2 ${isVoided ? "line-through text-neutral-400" : ""}`}>
                          {formatDateTime(s.created_at)}
                        </td>
                        <td className={`py-1 px-2 ${isVoided ? "line-through text-neutral-400" : ""}`}>
                          {storeName(s.store_id)}
                        </td>
                        <td className={`py-1 px-2 ${isVoided ? "line-through text-neutral-400" : ""}`}>
                          {s.register_id ? registerMap[s.register_id] ?? "Caja" : "—"}
                        </td>
                        <td className={`py-1 px-2 text-right font-medium ${isVoided ? "line-through text-neutral-400" : ""}`}>
                          {formatMoney(s.total)}
                        </td>
                        <td className={`py-1 px-2 ${isVoided ? "text-neutral-400" : ""}`}>
                          {METHOD_LABELS[s.method] ?? s.method}
                        </td>
                        <td className="py-1 px-2">
                          {isVoided ? (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                              ANULADA
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              OK
                            </span>
                          )}
                        </td>
                        <td className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                          {!isVoided && (
                            <button
                              type="button"
                              onClick={() => setVoidTarget(s)}
                              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                            >
                              Anular
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className={`border-b ${isVoided ? "bg-red-50/40" : "bg-blue-50"}`}>
                          <td></td>
                          <td colSpan={7} className="py-2 px-4">
                            {isVoided && s.voided_at && (
                              <div className="text-[10px] text-red-700 mb-2 space-y-0.5">
                                <p className="font-medium">Anulada el {formatDateTime(s.voided_at)}</p>
                                <p>
                                  Ejecutó: {s.voided_by ? s.voided_by.slice(0, 8) : "—"}
                                  {s.voided_from_register_id ? ` desde ${registerMap[s.voided_from_register_id] ?? "otra caja"}` : ""}
                                </p>
                                <p>
                                  Autorizó supervisor: {s.void_authorized_name ?? s.void_authorized_code ?? s.void_authorized_by?.slice(0, 8) ?? "—"}
                                </p>
                                {s.void_reason && <p>Motivo: {s.void_reason}</p>}
                              </div>
                            )}
                            {itemsLoading === s.id ? (
                              <span className="text-neutral-400">Cargando productos…</span>
                            ) : !items || items.length === 0 ? (
                              <span className="text-neutral-400">Sin detalle de productos.</span>
                            ) : (
                              <table className="min-w-[700px] text-xs">
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
                    </React.Fragment>
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
