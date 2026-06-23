"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getPosEmployee } from "@/lib/posSession";

type Store = { id: string; name: string };

type Row = {
  product_id?: string | null;
  sku?: string | null;
  name?: string | null;

  supplier_name?: string | null;

  cost_net?: number | null;
  vat_rate?: number | null;

  current_price?: number | null;
  current_markup_pct?: number | null;

  suggested_pct?: number | null; // (+) subir, (-) bajar
  suggested_price?: number | null;

  reason?: string | null;
  confidence?: number | null;
};

function iso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function money(n: any) {
  const v = typeof n === "number" ? n : n == null ? null : Number(n);
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function pct(n: any) {
  const v = typeof n === "number" ? n : n == null ? null : Number(n);
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(1)}%`;
}

function levelFromSuggestedPct(suggestedPct: number | null | undefined) {
  const v = suggestedPct ?? 0;
  const a = Math.abs(v);
  if (a >= 10) return { label: "Alta", cls: "bg-red-50 text-red-700 border-red-200" };
  if (a >= 5) return { label: "Media", cls: "bg-yellow-50 text-yellow-800 border-yellow-200" };
  if (a > 0.1) return { label: "Baja", cls: "bg-blue-50 text-blue-700 border-blue-200" };
  return { label: "OK", cls: "bg-green-50 text-green-700 border-green-200" };
}

function actionFromSuggestedPct(suggestedPct: number | null | undefined) {
  const v = suggestedPct ?? 0;
  if (v > 0.1) return "SUBIR";
  if (v < -0.1) return "BAJAR";
  return "OK";
}

export default function Page() {
  const router = useRouter();

  // ✅ Evita hydration: no leemos session/localStorage en render inicial
  const [ready, setReady] = useState(false);
  const [emp, setEmp] = useState<ReturnType<typeof getPosEmployee>>(null);

  const isSupervisor = useMemo(() => (emp?.role ?? "") === "supervisor", [emp]);

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");

  // ✅ Evita hydration: fechas se setean SOLO en cliente (useEffect)
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    // mounted
    setEmp(getPosEmployee());
    setReady(true);

    const d = new Date();
    const dFrom = new Date();
    dFrom.setDate(dFrom.getDate() - 7);

    setDateFrom(iso(dFrom));
    setDateTo(iso(d));
  }, []);

  // 🔐 supervisor only
  useEffect(() => {
    if (!ready) return;
    if (!isSupervisor) router.push("/ventas");
  }, [ready, isSupervisor, router]);

  useEffect(() => {
    if (!ready || !isSupervisor) return;
    fetch("/api/stores")
      .then((r) => r.json())
      .then((j) => setStores((j.stores ?? []) as Store[]))
      .catch(console.error);
  }, [ready, isSupervisor]);

  async function load() {
    if (!dateFrom || !dateTo) return;

    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/intelligence/margin-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date_from: dateFrom,
          date_to: dateTo,
          store_id: storeId ? storeId : null,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Error cargando sugerencias");

      setRows((json?.rows ?? []) as Row[]);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // ✅ carga inicial cuando ya está montado + supervisor + fechas listas
  useEffect(() => {
    if (!ready || !isSupervisor) return;
    if (!dateFrom || !dateTo) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isSupervisor, dateFrom, dateTo]);

  if (!ready) return null;
  if (!isSupervisor) return null;

  return (
    <main className="mx-auto max-w-7xl overflow-x-hidden p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">IA — Sugerencias de margen</h1>
          <p className="text-sm text-black/60 mt-1">
            Esto te marca productos donde conviene <b>subir</b> o <b>bajar</b> margen según ventas recientes.
            No aplica cambios: solo recomienda.
          </p>
        </div>

        <button
          onClick={load}
          className="w-full rounded-lg bg-black px-3 py-3 text-white hover:bg-black/90 sm:w-auto sm:py-2"
          disabled={loading || !dateFrom || !dateTo}
        >
          {loading ? "Cargando..." : "Actualizar"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="border rounded-xl p-3">
          <div className="text-xs text-black/60 mb-1">Desde</div>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full border rounded-lg px-2 py-1.5"
          />
        </div>

        <div className="border rounded-xl p-3">
          <div className="text-xs text-black/60 mb-1">Hasta</div>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full border rounded-lg px-2 py-1.5"
          />
        </div>

        <div className="border rounded-xl p-3 md:col-span-2">
          <div className="text-xs text-black/60 mb-1">Sucursal (opcional)</div>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="w-full border rounded-lg px-2 py-1.5"
          >
            <option value="">Todas</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="text-xs text-black/50 mt-2">
            Tip: si elegís una sucursal, la recomendación se ajusta al consumo de esa zona.
          </div>
        </div>
      </div>

      {err && (
        <div className="mt-4 border border-red-200 bg-red-50 text-red-700 rounded-xl p-3">
          {err}
        </div>
      )}

      <div className="mt-4 border rounded-xl overflow-hidden">
        <div className="px-3 py-2 bg-black/5 flex items-center justify-between">
          <div className="text-sm">
            Resultados: <b>{rows.length}</b>
          </div>
          <div className="text-xs text-black/50">Acción = recomendación (no cambia nada)</div>
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {rows.length === 0 && !loading ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-black/60">No hay sugerencias en este rango. Probá ampliar fechas o sacar el filtro de sucursal.</div>
          ) : (
            rows.map((r, idx) => {
              const lvl = levelFromSuggestedPct(r.suggested_pct ?? null);
              const act = actionFromSuggestedPct(r.suggested_pct ?? null);
              const title = `${r.name ?? "—"}${r.sku ? ` (${r.sku})` : ""}`;
              return (
                <article key={`${r.product_id ?? "x"}-${idx}`} className="rounded-2xl border bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold leading-snug">{title}</div>
                      <div className="mt-1 text-xs text-black/50">{r.supplier_name ?? "Proveedor —"}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${lvl.cls}`}>{lvl.label}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-neutral-50 p-2"><div className="text-[11px] uppercase text-black/50">Costo</div><div className="font-semibold">{money(r.cost_net)}</div></div>
                    <div className="rounded-xl bg-neutral-50 p-2"><div className="text-[11px] uppercase text-black/50">Precio actual</div><div className="font-semibold">{money(r.current_price)}</div></div>
                    <div className="rounded-xl bg-neutral-50 p-2"><div className="text-[11px] uppercase text-black/50">Margen actual</div><div className="font-semibold">{pct(r.current_markup_pct)}</div></div>
                    <div className="rounded-xl bg-neutral-50 p-2"><div className="text-[11px] uppercase text-black/50">Sugerencia</div><div className="font-semibold">{act} <span className="text-black/60">({pct(r.suggested_pct)})</span></div></div>
                  </div>
                  <div className="mt-3 rounded-xl bg-blue-50 p-2 text-sm"><div className="text-[11px] uppercase text-blue-700">Precio sugerido</div><div className="font-semibold">{money(r.suggested_price)}</div></div>
                  <div className="mt-2 text-sm text-black/70">{r.reason ?? "—"}</div>
                </article>
              );
            })
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-black/5">
              <tr>
                <th className="p-2 text-left">Producto</th>
                <th className="p-2 text-left">Proveedor</th>
                <th className="p-2 text-right">Costo</th>
                <th className="p-2 text-right">Precio actual</th>
                <th className="p-2 text-right">Margen actual</th>
                <th className="p-2 text-right">Sugerencia</th>
                <th className="p-2 text-right">Precio sugerido</th>
                <th className="p-2 text-left">Nivel</th>
                <th className="p-2 text-left">Motivo</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r, idx) => {
                const lvl = levelFromSuggestedPct(r.suggested_pct ?? null);
                const act = actionFromSuggestedPct(r.suggested_pct ?? null);

                const title = `${r.name ?? "—"}${r.sku ? ` (${r.sku})` : ""}`;

                return (
                  <tr key={`${r.product_id ?? "x"}-${idx}`} className="border-t">
                    <td className="p-2">
                      <div className="font-medium">{title}</div>
                    </td>

                    <td className="p-2">{r.supplier_name ?? "—"}</td>

                    <td className="p-2 text-right">{money(r.cost_net)}</td>
                    <td className="p-2 text-right">{money(r.current_price)}</td>
                    <td className="p-2 text-right">{pct(r.current_markup_pct)}</td>

                    <td className="p-2 text-right">
                      <span className="font-semibold">{act}</span>{" "}
                      <span className="text-black/60">({pct(r.suggested_pct)})</span>
                    </td>

                    <td className="p-2 text-right">{money(r.suggested_price)}</td>

                    <td className="p-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs ${lvl.cls}`}>
                        {lvl.label}
                      </span>
                    </td>

                    <td className="p-2 text-black/70">{r.reason ?? "—"}</td>
                  </tr>
                );
              })}

              {!loading && rows.length === 0 && (
                <tr>
                  <td className="p-4 text-black/60" colSpan={9}>
                    No hay sugerencias en este rango. Probá ampliar fechas o sacar el filtro de sucursal.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 text-xs text-black/55">
        <b>Nivel</b>: mide cuán grande es el cambio recomendado (por %). <br />
        <b>Alta</b> ≥ 10%, <b>Media</b> ≥ 5%, <b>Baja</b> &gt; 0.1%, <b>OK</b> ≈ sin cambio.
      </div>
    </main>
  );
}
