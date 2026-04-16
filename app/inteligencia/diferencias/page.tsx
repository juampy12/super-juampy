"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getPosEmployee } from "@/lib/posSession";

type Store = { id: string; name: string };

type Row = {
  day: string;
  store_id: string;
  store_name: string | null;
  register_id: string;
  register_name: string | null;

  expected_cash: number;
  expected_debit: number;
  expected_credit: number;
  expected_mp: number;
  expected_cuenta_corriente: number;
  expected_mixto: number;

  declared_cash: number | null;
  declared_debit: number | null;
  declared_credit: number | null;
  declared_mp: number | null;
  declared_cuenta_corriente: number | null;
  declared_mixto: number | null;

  diff_cash: number | null;
  diff_debit: number | null;
  diff_credit: number | null;
  diff_mp: number | null;
  diff_cuenta_corriente: number | null;
  diff_mixto: number | null;

  diff_total: number | null;
  abs_diff_total: number | null;

  risk_level: "pendiente" | "bajo" | "medio" | "alto" | string;
  reasons: string[] | null;
};

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `$${Number(n).toFixed(2)}`;
}

function badge(level: string) {
  if (level === "pendiente") return { text: "PENDIENTE", cls: "bg-blue-100 text-blue-800 border-blue-200" };
  if (level === "alto") return { text: "ALTO", cls: "bg-red-100 text-red-800 border-red-200" };
  if (level === "medio") return { text: "ATENCIÓN", cls: "bg-yellow-100 text-yellow-800 border-yellow-200" };
  return { text: "OK", cls: "bg-green-100 text-green-800 border-green-200" };
}

export default function InteligenciaDiferenciasPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");

  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return isoDate(d);
  });
  const [dateTo, setDateTo] = useState<string>(() => isoDate(new Date()));

  const [rows, setRows] = useState<Row[]>([]);
  const [openKey, setOpenKey] = useState<string>("");

  // 🔐 supervisor only
  useEffect(() => {
    const emp = getPosEmployee();
    if (!emp || emp.role !== "supervisor") {
      window.location.href = "/ventas";
      return;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("stores").select("id,name").order("name");
      setStores((data as any) ?? []);
    })();
  }, []);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/intelligence/register-diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date_from: dateFrom,
          date_to: dateTo,
          store_id: storeId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Error");
      setRows(json?.rows ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const pendiente = rows.filter((r) => r.risk_level === "pendiente").length;
    const alto = rows.filter((r) => r.risk_level === "alto").length;
    const medio = rows.filter((r) => r.risk_level === "medio").length;
    const ok = rows.length - pendiente - alto - medio;
    return { total: rows.length, pendiente, alto, medio, ok };
  }, [rows]);

  const sorted = useMemo(() => {
    // PENDIENTE primero, después ALTO/MEDIO por mayor abs diff
    return [...rows].sort((a, b) => {
      const rank = (x: Row) =>
        x.risk_level === "pendiente" ? 0 : x.risk_level === "alto" ? 1 : x.risk_level === "medio" ? 2 : 3;
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      const da = a.abs_diff_total ?? -1;
      const db = b.abs_diff_total ?? -1;
      return db - da;
    });
  }, [rows]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">Inteligencia · Diferencias de caja</h1>
          <p className="max-w-2xl text-sm text-neutral-600">
            Compara <b>ventas (esperado)</b> vs <b>cierre (declarado)</b> por día y caja.
            <br />
            Si dice <b>PENDIENTE</b>, falta cargar el cierre (no es faltante).
          </p>
        </div>
      </div>

      <div className="grid gap-4 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(180px,220px)_minmax(180px,220px)_minmax(220px,260px)_minmax(180px,220px)] items-end">
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.15em] text-neutral-500">Desde</div>
          <input
            className="w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-2 focus:ring-black/10"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.15em] text-neutral-500">Hasta</div>
          <input
            className="w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-2 focus:ring-black/10"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.15em] text-neutral-500">Sucursal</div>
          <select
            className="w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-2 focus:ring-black/10"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            <option value="">Todas</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={load}
            className="w-full rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Cargando..." : "Actualizar"}
          </button>
        </div>
      </div>

      {err && <div className="border border-red-300 bg-red-50 text-red-700 rounded p-3">{err}</div>}

      <div className="grid gap-3 sm:grid-cols-5">
        <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Total</div>
          <div className="mt-2 text-3xl font-semibold text-black">{stats.total}</div>
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">PENDIENTE</div>
          <div className="mt-2 text-3xl font-semibold text-black">{stats.pendiente}</div>
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">ALTO</div>
          <div className="mt-2 text-3xl font-semibold text-black">{stats.alto}</div>
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">ATENCIÓN</div>
          <div className="mt-2 text-3xl font-semibold text-black">{stats.medio}</div>
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">OK</div>
          <div className="mt-2 text-3xl font-semibold text-black">{stats.ok}</div>
        </div>
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white shadow-sm overflow-x-auto overflow-y-hidden">
        <table className="min-w-[1200px] w-max text-sm divide-y divide-neutral-200">
          <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase tracking-[0.12em] text-neutral-600">
            <tr>
              <th className="p-3 text-left">Día</th>
              <th className="p-3 text-left">Sucursal</th>
              <th className="p-3 text-left">Caja</th>
              <th className="p-3 text-left">Estado</th>
              <th className="p-3 text-right">Diferencia total</th>
              <th className="p-3 text-left">Motivo</th>
            </tr>
          </thead>

          <tbody>
            {sorted.map((r) => {
              const key = `${r.day}:${r.store_id}:${r.register_id}`;
              const isOpen = openKey === key;
              const b = badge(r.risk_level);

              const dt = r.diff_total;
              const dtText =
                dt == null ? "—" : dt < 0 ? `FALTA ${money(Math.abs(dt))}` : dt > 0 ? `SOBRA ${money(dt)}` : "CUADRA";

              return (
                <Fragment key={key}>
                  <tr
                    className="cursor-pointer transition-colors duration-150 hover:bg-black/5"
                    onClick={() => setOpenKey(isOpen ? "" : key)}
                    title="Click para ver detalle por método"
                  >
                    <td className="p-3">{r.day}</td>
                    <td className="p-3">{r.store_name ?? r.store_id}</td>
                    <td className="p-3">{r.register_name ?? r.register_id}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${b.cls}`}>{b.text}</span>
                    </td>
                    <td className="p-3 text-right font-semibold">{dtText}</td>
                    <td className="p-3 text-neutral-700">{r.reasons?.[0] ?? "—"}</td>
                  </tr>

                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="p-4 bg-neutral-50">
                        {r.risk_level === "pendiente" ? (
                          <div className="text-sm text-neutral-700">
                            <b>PENDIENTE:</b> cargá el cierre de caja de ese día para que el sistema pueda comparar.
                          </div>
                        ) : (
                          <div className="grid gap-3 text-sm md:grid-cols-3">
                            <div className="rounded-3xl border border-neutral-200 bg-white p-3 shadow-sm">
                              <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">Efectivo (decl − esp)</div>
                              <div className="mt-2 text-base font-semibold text-black">{money(r.diff_cash)}</div>
                              <div className="mt-2 text-xs text-neutral-500">
                                Esperado: {money(r.expected_cash)} · Declarado: {money(r.declared_cash)}
                              </div>
                            </div>

                            <div className="rounded-3xl border border-neutral-200 bg-white p-3 shadow-sm">
                              <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">Débito (decl − esp)</div>
                              <div className="mt-2 text-base font-semibold text-black">{money(r.diff_debit)}</div>
                              <div className="mt-2 text-xs text-neutral-500">
                                Esperado: {money(r.expected_debit)} · Declarado: {money(r.declared_debit)}
                              </div>
                            </div>

                            <div className="rounded-3xl border border-neutral-200 bg-white p-3 shadow-sm">
                              <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">MP (decl − esp)</div>
                              <div className="mt-2 text-base font-semibold text-black">{money(r.diff_mp)}</div>
                              <div className="mt-2 text-xs text-neutral-500">
                                Esperado: {money(r.expected_mp)} · Declarado: {money(r.declared_mp)}
                              </div>
                            </div>

                            <div className="rounded-3xl border border-neutral-200 bg-white p-3 shadow-sm">
                              <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">Crédito (decl − esp)</div>
                              <div className="font-semibold">{money(r.diff_credit)}</div>
                              <div className="text-xs opacity-70">
                                Esperado: {money(r.expected_credit)} · Declarado: {money(r.declared_credit)}
                              </div>
                            </div>

                            <div className="rounded-3xl border border-neutral-200 bg-white p-3 shadow-sm">
                              <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">Cuenta corriente (decl − esp)</div>
                              <div className="font-semibold">{money(r.diff_cuenta_corriente)}</div>
                              <div className="text-xs opacity-70">
                                Esperado: {money(r.expected_cuenta_corriente)} · Declarado:{" "}
                                {money(r.declared_cuenta_corriente)}
                              </div>
                            </div>

                            <div className="rounded-3xl border border-neutral-200 bg-white p-3 shadow-sm">
                              <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">Mixto (decl − esp)</div>
                              <div className="font-semibold">{money(r.diff_mixto)}</div>
                              <div className="text-xs opacity-70">
                                Esperado: {money(r.expected_mixto)} · Declarado: {money(r.declared_mixto)}
                              </div>
                            </div>

                            <div className="md:col-span-3">
                              <div className="text-sm font-semibold mb-1">Motivos</div>
                              {r.reasons?.length ? (
                                <ul className="list-disc ml-5 text-sm space-y-1">
                                  {r.reasons.map((x, idx) => (
                                    <li key={`${key}:reason:${idx}`}>{x}</li>
                                  ))}
                                </ul>
                              ) : (
                                <div className="text-sm opacity-70">—</div>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {sorted.length === 0 && !loading && (
              <tr>
                <td className="p-3 opacity-70" colSpan={6}>
                  Sin datos para el rango seleccionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
