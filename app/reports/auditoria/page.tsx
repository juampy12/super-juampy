"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { STORES as ALL_STORES } from "@/lib/stores";
import { getPosEmployee } from "@/lib/posSession";

type Register = { id: string; name: string; store_id: string | null };

type AuditOperation = {
  id: string;
  type: "void" | "closure_create" | "closure_replace";
  at: string;
  sale_id?: string;
  closure_id?: string;
  sale_created_at?: string;
  date?: string;
  store_id: string | null;
  register_id: string | null;
  total: number;
  total_cash?: number;
  tickets?: number;
  cashier_id?: string | null;
  cashier_role?: string | null;
  supervisor_id?: string | null;
  supervisor_code?: string | null;
  supervisor_name?: string | null;
  actor_id?: string | null;
  actor_role?: string | null;
  reason?: string | null;
  from_store_id?: string | null;
  from_register_id?: string | null;
  legacy_notes?: string[];
};

type AuditAlert = {
  severity: "low" | "medium" | "high";
  title: string;
  message: string;
  operation_id: string | null;
};

type AuditResponse = {
  operations: AuditOperation[];
  alerts: AuditAlert[];
  kpis: {
    voids: number;
    void_total: number;
    closure_creates: number;
    closure_replacements: number;
    alerts: number;
  };
};

const STORES = ALL_STORES.map((store) => ({ id: store.id, name: store.short }));

function todayStr() {
  return new Date()
    .toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
    .split("/")
    .reverse()
    .map((part) => part.padStart(2, "0"))
    .join("-");
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
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

function shortId(value?: string | null) {
  if (!value) return "-";
  return value.length > 8 ? value.slice(0, 8) : value;
}

function operationLabel(type: AuditOperation["type"]) {
  if (type === "void") return "Anulación";
  if (type === "closure_replace") return "Reemplazo cierre";
  return "Cierre";
}

function operationBadgeClass(type: AuditOperation["type"]) {
  if (type === "void") return "bg-red-50 text-red-700";
  if (type === "closure_replace") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}

function alertBadgeClass(severity: AuditAlert["severity"]) {
  if (severity === "high") return "border-red-200 bg-red-50 text-red-800";
  if (severity === "medium") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

export default function AuditOperationsPage() {
  const [ready, setReady] = useState(false);
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = todayStr();
  const [fromDate, setFromDate] = useState(addDays(today, -6));
  const [toDate, setToDate] = useState(today);
  const [filterStore, setFilterStore] = useState("");
  const [filterRegister, setFilterRegister] = useState("");
  const [filterType, setFilterType] = useState("all");

  const [registers, setRegisters] = useState<Register[]>([]);
  const [data, setData] = useState<AuditResponse>({
    operations: [],
    alerts: [],
    kpis: {
      voids: 0,
      void_total: 0,
      closure_creates: 0,
      closure_replacements: 0,
      alerts: 0,
    },
  });

  useEffect(() => {
    const emp = getPosEmployee();
    setIsSupervisor(emp?.role === "supervisor");
    setReady(true);
  }, []);

  async function loadRegisters(storeId?: string) {
    try {
      const params = new URLSearchParams();
      if (storeId) params.set("store_id", storeId);
      const res = await fetch(`/api/registers?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error cargando cajas");
      setRegisters(Array.isArray(json.registers) ? json.registers : []);
    } catch (e: any) {
      console.error(e);
      toast.error("No se pudieron cargar las cajas");
    }
  }

  async function loadAudit() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("from", fromDate);
      params.set("to", toDate);
      params.set("type", filterType);
      if (filterStore) params.set("store_id", filterStore);
      if (filterRegister) params.set("register_id", filterRegister);

      const res = await fetch(`/api/audit/operations?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error cargando auditoría");
      setData({
        operations: Array.isArray(json.operations) ? json.operations : [],
        alerts: Array.isArray(json.alerts) ? json.alerts : [],
        kpis: json.kpis ?? data.kpis,
      });
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Error cargando auditoría");
      toast.error("Error cargando auditoría");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready || !isSupervisor) return;
    loadRegisters(filterStore || undefined);
    setFilterRegister("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isSupervisor, filterStore]);

  useEffect(() => {
    if (!ready || !isSupervisor) return;
    loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isSupervisor, fromDate, toDate, filterStore, filterRegister, filterType]);

  const registerMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const register of registers) map[register.id] = register.name;
    return map;
  }, [registers]);

  const storeName = (id?: string | null) => STORES.find((store) => store.id === id)?.name ?? shortId(id);
  const registerName = (id?: string | null) => (id ? registerMap[id] ?? shortId(id) : "-");

  if (!ready) {
    return <main className="p-6 text-sm text-neutral-500">Cargando…</main>;
  }

  if (!isSupervisor) {
    return (
      <main className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
          Solo supervisores pueden ver auditoría de operaciones.
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-4 p-3 sm:space-y-6 sm:p-4">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold sm:text-3xl">Auditoría de operaciones</h1>
        <p className="max-w-3xl text-sm text-neutral-600">
          Control de anulaciones, cierres y reemplazos de cierre. Sirve para detectar movimientos repetidos,
          operaciones desde otra caja y acciones que conviene revisar.
        </p>
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="space-y-1 text-sm">
            <span className="text-neutral-600">Desde</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-neutral-600">Hasta</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-neutral-600">Sucursal</span>
            <select
              value={filterStore}
              onChange={(e) => setFilterStore(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
            >
              <option value="">Todas</option>
              {STORES.map((store) => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-neutral-600">Caja</span>
            <select
              value={filterRegister}
              onChange={(e) => setFilterRegister(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
            >
              <option value="">Todas</option>
              {registers.map((register) => (
                <option key={register.id} value={register.id}>{register.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-neutral-600">Tipo</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
            >
              <option value="all">Todas</option>
              <option value="voids">Anulaciones</option>
              <option value="closures">Cierres</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setFromDate(today); setToDate(today); }}
            className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => { const yesterday = addDays(today, -1); setFromDate(yesterday); setToDate(yesterday); }}
            className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Ayer
          </button>
          <button
            type="button"
            onClick={() => { setFromDate(addDays(today, -6)); setToDate(today); }}
            className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Últimos 7 días
          </button>
          <button
            type="button"
            onClick={loadAudit}
            disabled={loading}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-5">
        <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">Anulaciones</div>
          <div className="mt-2 text-2xl font-semibold sm:text-3xl">{data.kpis.voids}</div>
        </div>
        <div className="col-span-2 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm md:col-span-2">
          <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">Monto anulado</div>
          <div className="mt-2 text-2xl font-semibold sm:text-3xl">{formatMoney(data.kpis.void_total)}</div>
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">Reemplazos</div>
          <div className="mt-2 text-2xl font-semibold sm:text-3xl">{data.kpis.closure_replacements}</div>
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">Alertas</div>
          <div className="mt-2 text-3xl font-semibold text-amber-600">{data.kpis.alerts}</div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Alertas para revisar</h2>
            <p className="text-sm text-neutral-500">No bloquean la operación; ayudan a encontrar patrones raros.</p>
          </div>
        </div>
        {data.alerts.length === 0 ? (
          <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">
            Sin alertas en el rango seleccionado.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.alerts.map((alert, index) => (
              <div key={`${alert.title}-${index}`} className={`rounded-2xl border p-3 text-sm ${alertBadgeClass(alert.severity)}`}>
                <div className="font-semibold">{alert.title}</div>
                <div>{alert.message}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="font-semibold">Operaciones</h2>
          <p className="text-sm text-neutral-500">
            Mostrando {data.operations.length} movimientos para el filtro actual.
          </p>
        </div>
        <div className="space-y-3 md:hidden">
          {data.operations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500">
              No hay operaciones de auditoría en este rango.
            </div>
          ) : (
            data.operations.map((op) => {
              const fromDifferentRegister = op.from_register_id && op.register_id && op.from_register_id !== op.register_id;
              const executorId = op.type === "void" ? op.cashier_id : op.actor_id;
              const executorRole = op.type === "void" ? op.cashier_role : op.actor_role;
              return (
                <article key={op.id} className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-neutral-500">{formatDateTime(op.at)}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${operationBadgeClass(op.type)}`}>
                          {operationLabel(op.type)}
                        </span>
                        {op.sale_id && <span className="text-xs text-neutral-500">Venta {shortId(op.sale_id)}</span>}
                        {op.closure_id && <span className="text-xs text-neutral-500">Cierre {shortId(op.closure_id)}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-base font-semibold">{formatMoney(op.total)}</div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-neutral-50 p-2">
                      <div className="text-[11px] uppercase tracking-wide text-neutral-500">Sucursal</div>
                      <div className="font-medium">{storeName(op.store_id)}</div>
                    </div>
                    <div className="rounded-xl bg-neutral-50 p-2">
                      <div className="text-[11px] uppercase tracking-wide text-neutral-500">Caja</div>
                      <div className="font-medium">{registerName(op.register_id)}</div>
                      {fromDifferentRegister && (
                        <div className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700">
                          Desde {registerName(op.from_register_id)}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl bg-neutral-50 p-2">
                      <div className="text-[11px] uppercase tracking-wide text-neutral-500">Ejecutó</div>
                      <div className="font-medium">{shortId(executorId)}</div>
                      <div className="text-xs text-neutral-500">{executorRole ?? "-"}</div>
                    </div>
                    <div className="rounded-xl bg-neutral-50 p-2">
                      <div className="text-[11px] uppercase tracking-wide text-neutral-500">Autorizó</div>
                      {op.type === "void" ? (
                        <>
                          <div className="font-medium">{op.supervisor_name ?? shortId(op.supervisor_id)}</div>
                          <div className="text-xs text-neutral-500">Código {op.supervisor_code ?? "-"}</div>
                        </>
                      ) : (
                        <div className="text-neutral-400">-</div>
                      )}
                    </div>
                  </div>

                  {(op.reason || (op.legacy_notes && op.legacy_notes.length > 0)) && (
                    <div className="mt-3 rounded-xl bg-neutral-50 p-2 text-sm">
                      <div className="text-[11px] uppercase tracking-wide text-neutral-500">Motivo</div>
                      <div className="whitespace-pre-wrap">{op.reason || "-"}</div>
                      {op.legacy_notes && op.legacy_notes.length > 0 && (
                        <div className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">
                          Nota: {op.legacy_notes.join(" · ")}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[1120px] w-full text-sm">
            <thead>
              <tr className="border-b bg-neutral-50 text-left text-xs uppercase tracking-[0.12em] text-neutral-500">
                <th className="px-3 py-3">Fecha</th>
                <th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3">Sucursal</th>
                <th className="px-3 py-3">Caja</th>
                <th className="px-3 py-3">Monto</th>
                <th className="px-3 py-3">Ejecutó</th>
                <th className="px-3 py-3">Autorizó</th>
                <th className="px-3 py-3">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {data.operations.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-neutral-500">
                    No hay operaciones de auditoría en este rango.
                  </td>
                </tr>
              )}
              {data.operations.map((op) => {
                const fromDifferentRegister = op.from_register_id && op.register_id && op.from_register_id !== op.register_id;
                return (
                  <tr key={op.id} className="border-b align-top last:border-0">
                    <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(op.at)}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${operationBadgeClass(op.type)}`}>
                        {operationLabel(op.type)}
                      </span>
                      {op.sale_id && <div className="mt-1 text-xs text-neutral-500">Venta {shortId(op.sale_id)}</div>}
                      {op.closure_id && <div className="mt-1 text-xs text-neutral-500">Cierre {shortId(op.closure_id)}</div>}
                    </td>
                    <td className="px-3 py-3">{storeName(op.store_id)}</td>
                    <td className="px-3 py-3">
                      <div>{registerName(op.register_id)}</div>
                      {fromDifferentRegister && (
                        <div className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700">
                          Desde {registerName(op.from_register_id)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 font-medium">{formatMoney(op.total)}</td>
                    <td className="px-3 py-3">
                      {op.type === "void" ? (
                        <>
                          <div>{shortId(op.cashier_id)}</div>
                          <div className="text-xs text-neutral-500">{op.cashier_role ?? "-"}</div>
                        </>
                      ) : (
                        <>
                          <div>{shortId(op.actor_id)}</div>
                          <div className="text-xs text-neutral-500">{op.actor_role ?? "-"}</div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {op.type === "void" ? (
                        <>
                          <div>{op.supervisor_name ?? shortId(op.supervisor_id)}</div>
                          <div className="text-xs text-neutral-500">Código {op.supervisor_code ?? "-"}</div>
                        </>
                      ) : (
                        <span className="text-neutral-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 max-w-[300px]">
                      <div className="whitespace-pre-wrap">{op.reason || "-"}</div>
                      {op.legacy_notes && op.legacy_notes.length > 0 && (
                        <div className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">
                          Nota: {op.legacy_notes.join(" · ")}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
