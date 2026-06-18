"use client";

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";

type Store = { id: string; name: string };
type Register = { id: string; name: string };

type Kpis = {
  totalAmount: number;
  tickets: number;
  avgTicket: number;
  cashIn: number;
  change: number;
  netCash: number;
};

type MethodSummary = {
  key: string;
  label: string;
  total: number;
};

type HourRow = {
  hour: string;
  tickets: number;
  total: number;
};

type TicketRow = {
  id: string;
  time: string;
  total: number;
  method: string;
  method_label: string;
  cash?: number;
  debit?: number;
  credit?: number;
  mp?: number;
  account?: number;
  change?: number;
};

type SaleItem = {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
};

type MetaInfo = {
  mixtoTickets: number;
  mixtoTotal: number;
};

type ExistingClosure = {
  id: string;
  store_id: string | null;
  register_id?: string | null;
  date: string;
  closed_at: string | null;
  total_sales: number;
  total_tickets: number;
  total_cash: number;
  notes?: string | null;
};

import { STORES as ALL_STORES } from "@/lib/stores";
import { getPosEmployee } from "@/lib/posSession";
import { auditActionLabel, formatAuditDate, parseAuditNotes, shortId } from "@/lib/auditNotes";
const STORES: Store[] = ALL_STORES.map(s => ({ id: s.id, name: s.short }));
type PosEmployee = ReturnType<typeof getPosEmployee>;

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CashClosurePage() {
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [employee, setEmployee] = useState<PosEmployee>(null);

  const [registers, setRegisters] = useState<Register[]>([]);
  const [selectedRegister, setSelectedRegister] = useState<string>("");
  const isCashier = employee?.role === "cashier";

  useEffect(() => {
    const emp = getPosEmployee();
    setEmployee(emp);
    const storeId = emp?.store_id;
    const registerId = emp?.register_id;
    const match = storeId ? STORES.find(s => s.id === storeId) : null;
    setSelectedStore(match ? match.id : (STORES[0]?.id ?? ""));
    if (registerId) setSelectedRegister(registerId);
  }, []);

  useEffect(() => {
    if (isCashier) return;
    setSelectedRegister(""); // resetea la caja al cambiar sucursal
  }, [isCashier, selectedStore]);

  const [kpis, setKpis] = useState<Kpis>({
    totalAmount: 0,
    tickets: 0,
    avgTicket: 0,
    cashIn: 0,
    change: 0,
    netCash: 0,
  });

  const [methods, setMethods] = useState<MethodSummary[]>([]);
  const [hourly, setHourly] = useState<HourRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [meta, setMeta] = useState<MetaInfo | null>(null);

  const [existingClosure, setExistingClosure] = useState<ExistingClosure | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [ticketItemsCache, setTicketItemsCache] = useState<Record<string, SaleItem[]>>({});
  const [ticketItemsLoading, setTicketItemsLoading] = useState<string | null>(null);

  async function toggleTicketExpand(id: string) {
    if (expandedTicketId === id) {
      setExpandedTicketId(null);
      return;
    }
    setExpandedTicketId(id);
    if (ticketItemsCache[id]) return;
    try {
      setTicketItemsLoading(id);
      const res = await fetch(`/api/sales/items?sale_id=${id}`, { cache: "no-store" });
      const json = await res.json();
      setTicketItemsCache((prev) => ({ ...prev, [id]: json.data ?? [] }));
    } catch {
      setTicketItemsCache((prev) => ({ ...prev, [id]: [] }));
    } finally {
      setTicketItemsLoading(null);
    }
  }

  function formatMoney(n: number) {
    return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function renderAudit(notes?: string | null) {
    const audit = parseAuditNotes(notes);
    if (audit.entries.length === 0 && audit.legacy.length === 0) return null;

    return (
      <details className="mt-3 rounded-lg border bg-white p-3 text-xs text-neutral-700">
        <summary className="cursor-pointer font-medium text-neutral-900">Ver auditoría del cierre</summary>
        <div className="mt-3 space-y-2">
          {audit.legacy.length > 0 && (
            <div className="rounded-md border border-blue-100 bg-blue-50 p-2">
              <div className="mb-1 font-semibold text-blue-900">Notas</div>
              {audit.legacy.map((line, idx) => (
                <p key={`legacy-${idx}`} className="text-blue-800">{line}</p>
              ))}
            </div>
          )}
          {audit.entries.length > 0 && (
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Auditoría automática
            </div>
          )}
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

  // =========================
  // Cargar cajas por sucursal
  // =========================
  useEffect(() => {
    let alive = true;

    async function loadRegisters() {
      if (!selectedStore) {
        setRegisters([]);
        setSelectedRegister("");
        return;
      }

      try {
        const params = new URLSearchParams();
        params.set("store_id", selectedStore);
        const res = await fetch(`/api/registers?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Error cargando cajas");
        if (!alive) return;

        let rows = (json.registers ?? []) as Register[];
        if (isCashier && employee?.register_id) {
          rows = rows.filter((r) => r.id === employee.register_id);
          if (rows.length === 0) {
            rows = [{ id: employee.register_id, name: "Caja asignada" }];
          }
          setRegisters(rows);
          setSelectedRegister(employee.register_id);
        } else {
          setRegisters(rows);
          setSelectedRegister(rows[0]?.id || "");
        }
      } catch (e) {
        console.error("Error cargando cajas", e);
        if (!alive) return;
        setRegisters([]);
        setSelectedRegister("");
      }
    }

    loadRegisters();

    return () => {
      alive = false;
    };
  }, [employee?.register_id, isCashier, selectedStore]);

  // =========================
  // Cargar cierre existente
  // =========================
  async function loadClosure() {
    try {
      if (!selectedDate || !selectedStore || !selectedRegister) {
        setExistingClosure(null);
        return;
      }

      const params = new URLSearchParams();
      params.append("date", selectedDate);
      params.append("store_id", selectedStore);
      params.append("register_id", selectedRegister);

      const res = await fetch(`/api/cash-closures?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        setExistingClosure(null);
        return;
      }

      const json: any = await res.json().catch(() => null);

      // ✅ API actual: { data: row|null }
      if (json && Object.prototype.hasOwnProperty.call(json, "data")) {
        setExistingClosure((json.data as ExistingClosure) ?? null);
        return;
      }

      // ✅ fallback defensivo (por si alguna vez llega un formato viejo)
      if (Array.isArray(json)) {
        const match = json.find(
          (row: any) =>
            row?.date === selectedDate &&
            row?.store_id === selectedStore &&
            row?.register_id === selectedRegister
        );
        setExistingClosure(match ?? null);
        return;
      }

      if (Array.isArray(json?.data)) {
        const match = json.data.find(
          (row: any) =>
            row?.date === selectedDate &&
            row?.store_id === selectedStore &&
            row?.register_id === selectedRegister
        );
        setExistingClosure(match ?? null);
        return;
      }

      setExistingClosure(null);
    } catch (err) {
      console.error("Error cargando cierre existente", err);
      setExistingClosure(null);
    }
  }

  // =========================
  // Cargar data del día (KPIs/tickets)
  // =========================
  async function loadData() {
    try {
      if (!selectedDate || !selectedStore || !selectedRegister) {
        setKpis({ totalAmount: 0, tickets: 0, avgTicket: 0, cashIn: 0, change: 0, netCash: 0 });
        setMethods([]);
        setHourly([]);
        setTickets([]);
        setMeta(null);
        return;
      }

      setLoading(true);

      const params = new URLSearchParams();
      params.append("date", selectedDate);
      params.append("store_id", selectedStore);
      params.append("register_id", selectedRegister);

      const res = await fetch(`/api/cash-closure?${params.toString()}`, { cache: "no-store" });

      if (!res.ok) {
        console.error("Error HTTP en /api/cash-closure", res.status);
        setKpis({ totalAmount: 0, tickets: 0, avgTicket: 0, cashIn: 0, change: 0, netCash: 0 });
        setMethods([]);
        setHourly([]);
        setTickets([]);
        setMeta(null);
        return;
      }

      const data = await res.json();

      const rawKpis = data?.kpis ?? {};
      setKpis({
        totalAmount: Number(rawKpis.totalAmount ?? 0),
        tickets: Number(rawKpis.tickets ?? 0),
        avgTicket: Number(rawKpis.avgTicket ?? 0),
        cashIn: Number(rawKpis.cashIn ?? 0),
        change: Number(rawKpis.change ?? 0),
        netCash: Number(rawKpis.netCash ?? 0),
      });

      setMethods(
        Array.isArray(data?.methods)
          ? data.methods.map((m: any) => ({
              key: String(m.key ?? m.method ?? ""),
              label: String(m.label ?? m.method_label ?? m.key ?? ""),
              total: Number(m.total ?? 0),
            }))
          : []
      );

      setHourly(
        Array.isArray(data?.hourly)
          ? data.hourly.map((h: any) => ({
              hour: String(h.hour ?? ""),
              tickets: Number(h.tickets ?? 0),
              total: Number(h.total ?? 0),
            }))
          : []
      );

      setTickets(
        Array.isArray(data?.tickets)
          ? data.tickets.map((t: any) => ({
              id: String(t.id ?? ""),
              time: String(t.time ?? t.hour ?? ""),
              total: Number(t.total ?? 0),
              method: String(t.method ?? ""),
              method_label: String(t.method_label ?? t.method ?? "Sin método"),
              cash: t.cash !== null && t.cash !== undefined ? Number(t.cash) : undefined,
              debit: t.debit !== null && t.debit !== undefined ? Number(t.debit) : undefined,
              credit: t.credit !== null && t.credit !== undefined ? Number(t.credit) : undefined,
              mp: t.mp !== null && t.mp !== undefined ? Number(t.mp) : undefined,
              account: t.account !== null && t.account !== undefined ? Number(t.account) : undefined,
              change: t.change !== null && t.change !== undefined ? Number(t.change) : undefined,
            }))
          : []
      );
      setExpandedTicketId(null);
      setTicketItemsCache({});

      const rawMeta = data?.meta ?? null;
      setMeta(
        rawMeta
          ? {
              mixtoTickets: Number(rawMeta.mixtoTickets ?? 0),
              mixtoTotal: Number(rawMeta.mixtoTotal ?? 0),
            }
          : null
      );
    } catch (err) {
      console.error("Error cargando datos de cierre", err);
      setKpis({ totalAmount: 0, tickets: 0, avgTicket: 0, cashIn: 0, change: 0, netCash: 0 });
      setMethods([]);
      setHourly([]);
      setTickets([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmClosure() {
    try {
      if (!selectedDate || !selectedStore || !selectedRegister) {
        toast.error("Falta seleccionar fecha, sucursal o caja.");
        return;
      }
      if (kpis.tickets === 0) {
        toast.error("No hay tickets para cerrar en esta fecha, sucursal y caja.");
        return;
      }

      const store = STORES.find((s) => s.id === selectedStore);
      const storeLabel = store?.name ?? "Sucursal";
      const regLabel = registers.find((r) => r.id === selectedRegister)?.name ?? "Caja";

      const ok = window.confirm(`¿Confirmar cierre de caja para ${storeLabel} - ${regLabel} - ${selectedDate}?`);
      if (!ok) return;

      setSaving(true);

      const findMethodTotal = (...candidates: string[]) => {
        const lowers = candidates.map((c) => c.toLowerCase());
        const m = methods.find((m) => {
          const key = (m.key || "").toLowerCase();
          const label = (m.label || "").toLowerCase();
          return lowers.includes(key) || lowers.some((c) => label.includes(c));
        });
        return m?.total ?? 0;
      };

      const payload = {
        store_id: selectedStore,
        register_id: selectedRegister,
        date: selectedDate,
        total_sales: kpis.totalAmount,
        total_tickets: kpis.tickets,
        total_cash: findMethodTotal("cash", "efectivo"),
        total_debit: findMethodTotal("debit", "debito", "débito"),
        total_credit: findMethodTotal("credit", "credito", "crédito"),
        total_mp: findMethodTotal("mp", "mercado pago"),
        total_cuenta_corriente: findMethodTotal("account", "cuenta_corriente", "cta cte"),
        total_mixto: findMethodTotal("mixto"),
      };

      const res = await fetch("/api/cash-closures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        toast.error(json?.error ?? "Error al guardar el cierre.");
        return;
      }

      toast.success("Cierre de caja guardado correctamente");
      await loadClosure();
    } catch (err) {
      console.error("Error confirmando cierre de caja", err);
      toast.error("Error inesperado al guardar el cierre.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReplaceClosure() {
    try {
      if (!selectedDate || !selectedStore || !selectedRegister) {
        toast.error("Falta seleccionar fecha, sucursal o caja.");
        return;
      }
      if (!kpis.tickets || kpis.tickets === 0) {
        toast.error("No hay tickets para esta fecha, sucursal y caja.");
        return;
      }
      if (!existingClosure) {
        toast.error("No hay un cierre previo para reemplazar.");
        return;
      }

      const ok = window.confirm(
        "Esto va a reemplazar el cierre existente con los datos actuales que ves en pantalla. ¿Continuar?"
      );
      if (!ok) return;
      const reason = window.prompt("Motivo del reemplazo de cierre:");
      if (!reason?.trim()) {
        toast.error("Ingresá un motivo para reemplazar el cierre.");
        return;
      }

      setSaving(true);

      const findMethodTotal = (...candidates: string[]) => {
        const lowers = candidates.map((c) => c.toLowerCase());
        const m = methods.find((m) => {
          const key = (m.key || "").toLowerCase();
          const label = (m.label || "").toLowerCase();
          return lowers.includes(key) || lowers.some((c) => label.includes(c));
        });
        return m?.total ?? 0;
      };

      const payload = {
        store_id: selectedStore,
        register_id: selectedRegister,
        date: selectedDate,
        total_sales: kpis.totalAmount,
        total_tickets: kpis.tickets,
        total_cash: findMethodTotal("cash", "efectivo"),
        total_debit: findMethodTotal("debit", "debito", "débito"),
        total_credit: findMethodTotal("credit", "credito", "crédito"),
        total_mp: findMethodTotal("mp", "mercado pago"),
        total_cuenta_corriente: findMethodTotal("account", "cuenta_corriente", "cta cte"),
        total_mixto: meta?.mixtoTotal ?? 0,
        first_ticket_at: null,
        last_ticket_at: null,
        reason: reason.trim(),
      };

      const res = await fetch("/api/cash-closures", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg = errJson?.error || `Error HTTP ${res.status}`;
        toast.error(`Error reemplazando el cierre: ${msg}`);
        return;
      }

      toast.success("Cierre de caja reemplazado correctamente");
      await loadClosure();
    } catch (e) {
      console.error("Error en handleReplaceClosure", e);
      toast.error("Error inesperado reemplazando el cierre.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadData();
    void loadClosure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedStore, selectedRegister]);

  const storeName = STORES.find((s) => s.id === selectedStore)?.name ?? "Sucursal";

  return (
    <main className="p-3 space-y-6 sm:p-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cierre de caja</h1>
          <p className="text-sm text-neutral-500">
            Resumen diario por sucursal, con desglose de métodos de pago y tickets.
          </p>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-2 lg:flex lg:w-auto lg:items-end">
          <div className="flex flex-col text-sm">
            <label className="text-neutral-500 mb-1">Fecha</label>
            <input
              type="date"
              className="w-full rounded border px-3 py-3 text-sm sm:py-2 lg:w-auto"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          {isCashier ? (
            <>
              <div className="flex flex-col text-sm">
                <label className="text-neutral-500 mb-1">Sucursal</label>
                <div className="rounded border bg-neutral-50 px-3 py-3 text-sm font-medium sm:py-2">
                  {storeName}
                </div>
              </div>

              <div className="flex flex-col text-sm">
                <label className="text-neutral-500 mb-1">Caja</label>
                <div className="rounded border bg-neutral-50 px-3 py-3 text-sm font-medium sm:py-2">
                  {registers.find((r) => r.id === selectedRegister)?.name ?? "Caja asignada"}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col text-sm">
                <label className="text-neutral-500 mb-1">Sucursal</label>
                <select
                  className="w-full rounded border px-3 py-3 text-sm sm:py-2 lg:w-auto"
                  value={selectedStore}
                  onChange={(e) => setSelectedStore(e.target.value)}
                >
                  {STORES.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col text-sm">
                <label className="text-neutral-500 mb-1">Caja</label>
                <select
                  className="w-full rounded border px-3 py-3 text-sm sm:py-2 lg:w-auto"
                  value={selectedRegister}
                  onChange={(e) => setSelectedRegister(e.target.value)}
                  disabled={registers.length === 0}
                >
                  {registers.length === 0 ? (
                    <option value="">Sin cajas</option>
                  ) : (
                    registers.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={handleConfirmClosure}
            disabled={loading || saving || kpis.tickets === 0 || !!existingClosure}
            className="mt-2 inline-flex w-full items-center justify-center rounded-lg border px-4 py-3 text-sm font-medium bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed sm:col-span-2 lg:mt-0 lg:w-auto lg:py-2"
          >
            {saving ? "Guardando cierre..." : "Confirmar cierre"}
          </button>

        </div>
      </div>

      {isCashier && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Estás cerrando la caja asignada a tu login: <span className="font-semibold">{storeName}</span>
          {" "}· <span className="font-semibold">{registers.find((r) => r.id === selectedRegister)?.name ?? "Caja asignada"}</span>.
          Si necesitás otra caja, salí e ingresá con el cajero correspondiente.
        </div>
      )}

      {existingClosure && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-emerald-900">
              <div className="font-semibold">Ya existe un cierre para esta fecha y caja.</div>
              <div className="mt-1">
                Total ventas <span className="font-semibold">{formatMoney(existingClosure.total_sales)}</span>
                {" "}· tickets <span className="font-semibold">{existingClosure.total_tickets}</span>
                {" "}· efectivo <span className="font-semibold">{formatMoney(existingClosure.total_cash)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleReplaceClosure}
              className="inline-flex items-center justify-center rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              disabled={loading || saving || kpis.tickets === 0}
            >
              Reemplazar cierre con datos actuales
            </button>
          </div>
          {renderAudit(existingClosure.notes)}
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <div className="md:col-span-2 rounded-xl border p-4 bg-neutral-50">
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Total del día</div>
          <div className="text-4xl font-bold mb-2">{loading ? "Cargando..." : formatMoney(kpis.totalAmount)}</div>
          <div className="text-sm text-neutral-600">
            {storeName} · {selectedDate || "-"}
          </div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500 mb-1">Efectivo cobrado</div>
          <div className="text-3xl font-semibold">{loading ? "…" : formatMoney(kpis.cashIn)}</div>
          <p className="text-xs text-neutral-500 mt-2">
            Suma de pagos en efectivo (incluyendo parte en ventas mixtas).
          </p>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500 mb-1">Neto esperado en caja</div>
          <div className="text-3xl font-semibold">{loading ? "…" : formatMoney(kpis.netCash)}</div>
          <p className="text-xs text-neutral-500 mt-2">Efectivo cobrado menos vuelto entregado.</p>
        </div>
      </section>

      <section className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium text-sm">Métodos de pago</h2>
          <span className="text-xs text-neutral-500">
            Total tickets: {kpis.tickets} · Ticket promedio: {formatMoney(kpis.avgTicket || 0)}
          </span>
        </div>

        {methods.length === 0 ? (
          <p className="text-sm text-neutral-500">No hay información de métodos para este día.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {methods.map((m) => (
              <div key={m.key} className="rounded-lg border px-3 py-2 bg-white flex items-center justify-between">
                <div className="text-sm font-medium">{m.label}</div>
                <div className="text-sm font-semibold">{formatMoney(m.total)}</div>
              </div>
            ))}
          </div>
        )}

        {meta && meta.mixtoTickets > 0 && (
          <p className="text-xs text-neutral-500">
            Ventas mixtas: {meta.mixtoTickets} tickets · Total imputado en mixto: {formatMoney(meta.mixtoTotal)}
          </p>
        )}
      </section>

      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-medium text-sm">Ventas por hora</h2>

        {hourly.length === 0 ? (
          <p className="text-sm text-neutral-500">No hay ventas registradas en esta fecha.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b bg-neutral-50">
                  <th className="text-left py-2 px-2">Hora</th>
                  <th className="text-right py-2 px-2">Tickets</th>
                  <th className="text-right py-2 px-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {hourly.map((h) => (
                  <tr key={h.hour} className="border-b last:border-0">
                    <td className="py-1 px-2">{h.hour}</td>
                    <td className="py-1 px-2 text-right">{h.tickets}</td>
                    <td className="py-1 px-2 text-right">{formatMoney(h.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-medium text-sm">Detalle de tickets</h2>

        {tickets.length === 0 ? (
          <p className="text-sm text-neutral-500">No hay tickets confirmados para esta fecha y sucursal.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[800px] text-xs">
              <thead>
                <tr className="border-b bg-neutral-50">
                  <th className="text-left py-2 px-2 w-4"></th>
                  <th className="text-left py-2 px-2">Hora</th>
                  <th className="text-right py-2 px-2">Total</th>
                  <th className="text-left py-2 px-2">Método</th>
                  <th className="text-right py-2 px-2">Efectivo</th>
                  <th className="text-right py-2 px-2">Débito</th>
                  <th className="text-right py-2 px-2">Crédito</th>
                  <th className="text-right py-2 px-2">MP</th>
                  <th className="text-right py-2 px-2">Cuenta</th>
                  <th className="text-right py-2 px-2">Vuelto</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const isExpanded = expandedTicketId === t.id;
                  const items = ticketItemsCache[t.id];
                  return (
                    <React.Fragment key={t.id}>
                      <tr
                        className="border-b last:border-0 cursor-pointer hover:bg-neutral-50"
                        onClick={() => toggleTicketExpand(t.id)}
                      >
                        <td className="py-1 px-2 text-neutral-400">{isExpanded ? "▼" : "▶"}</td>
                        <td className="py-1 px-2">{t.time}</td>
                        <td className="py-1 px-2 text-right">{formatMoney(t.total)}</td>
                        <td className="py-1 px-2">{t.method_label}</td>
                        <td className="py-1 px-2 text-right">{t.cash ? formatMoney(t.cash) : "—"}</td>
                        <td className="py-1 px-2 text-right">{t.debit ? formatMoney(t.debit) : "—"}</td>
                        <td className="py-1 px-2 text-right">{t.credit ? formatMoney(t.credit) : "—"}</td>
                        <td className="py-1 px-2 text-right">{t.mp ? formatMoney(t.mp) : "—"}</td>
                        <td className="py-1 px-2 text-right">{t.account ? formatMoney(t.account) : "—"}</td>
                        <td className="py-1 px-2 text-right">{t.change ? formatMoney(t.change) : "—"}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-blue-50 border-b">
                          <td></td>
                          <td colSpan={9} className="py-2 px-4">
                            {ticketItemsLoading === t.id ? (
                              <span className="text-neutral-400">Cargando productos…</span>
                            ) : !items || items.length === 0 ? (
                              <span className="text-neutral-400">Sin detalle de productos.</span>
                            ) : (
                              <table className="min-w-[800px] text-xs">
                                <thead>
                                  <tr className="text-neutral-500">
                                    <th className="text-left py-1 pr-6">Producto</th>
                                    <th className="text-right py-1 pr-6">Cant.</th>
                                    <th className="text-right py-1 pr-6">Precio unit.</th>
                                    <th className="text-right py-1">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((item, idx) => (
                                    <tr key={`${item.product_id}-${idx}`}>
                                      <td className="py-0.5 pr-6">{item.name}</td>
                                      <td className="py-0.5 pr-6 text-right">{item.quantity}</td>
                                      <td className="py-0.5 pr-6 text-right">{formatMoney(item.unit_price)}</td>
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

      <section className="rounded-xl border p-4 text-xs text-neutral-500">
        Basado solo en ventas con estado <strong>confirmed</strong> de la fecha seleccionada, la sucursal elegida y la{" "}
        <strong>caja</strong> seleccionada.
      </section>
    </main>
  );
}
