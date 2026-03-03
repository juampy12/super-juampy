"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import { supabase } from "@/lib/supabase";
import { getPosEmployee } from "@/lib/posSession";

type Store = { id: string; name: string };

type Row = {
  day: string;
  store_id: string;
  store_name?: string | null;
  register_id: string;
  register_name?: string | null;

  tickets: number;
  total_sales: number;

  cash_ratio: number;
  cash_ratio_store_avg?: number | null;
  cash_ratio_delta?: number | null;

  change_ratio: number;
  change_ratio_store_avg?: number | null;
  change_ratio_delta?: number | null;

  high_change_tickets: number;

  risk_score: number;
  risk_level?: "bajo" | "medio" | "alto" | string;
  reasons: string[] | null;
};

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function levelMeta(level?: string, score?: number) {
  const s = score ?? 0;
  const L = level ?? "";
  if (L === "alto" || s >= 80)
    return { text: "ALTO", cls: "bg-red-100 text-red-800 border-red-200" };
  if (L === "medio" || s >= 60)
    return { text: "ATENCIÓN", cls: "bg-yellow-100 text-yellow-800 border-yellow-200" };
  return { text: "NORMAL", cls: "bg-green-100 text-green-800 border-green-200" };
}

export default function IntelligenceControlPage() {
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

  // 🔐 Solo supervisor
  useEffect(() => {
    const emp = getPosEmployee();
    if (!emp || emp.role !== "supervisor") {
      window.location.href = "/ventas";
      return;
    }
  }, []);

  // Cargar sucursales
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id,name")
        .order("name");
      if (!error) setStores((data as any) ?? []);
    })();
  }, []);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/intelligence/register-risk", {
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
    const alto = rows.filter((r) => (r.risk_score ?? 0) >= 80).length;
    const medio = rows.filter((r) => (r.risk_score ?? 0) >= 60 && (r.risk_score ?? 0) < 80).length;
    const normal = rows.length - alto - medio;
    return { alto, medio, normal, total: rows.length };
  }, [rows]);

  const alerts = useMemo(() => rows.filter((r) => (r?.risk_score ?? 0) >= 60), [rows]);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Inteligencia · Control</h1>
        <p className="text-sm opacity-70">
          Este panel marca <b>cajas fuera de patrón</b> (no acusa robo). Usalo para decidir qué día/caja revisar.
        </p>
      </div>

      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="text-xs opacity-70">Desde</label>
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs opacity-70">Hasta</label>
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <div className="min-w-[260px]">
          <label className="text-xs opacity-70">Sucursal</label>
          <select
            className="border rounded px-2 py-1 w-full"
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

        <button
          onClick={load}
          className="bg-black text-white rounded px-4 py-2"
          disabled={loading}
        >
          {loading ? "Cargando..." : "Actualizar"}
        </button>
      </div>

      {err && (
        <div className="border border-red-300 bg-red-50 text-red-700 rounded p-3">
          {err}
        </div>
      )}

      {/* Resumen súper simple */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="border rounded p-3">
          <div className="text-xs opacity-70">Total filas</div>
          <div className="text-xl font-bold">{stats.total}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs opacity-70">NORMAL</div>
          <div className="text-xl font-bold">{stats.normal}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs opacity-70">ATENCIÓN</div>
          <div className="text-xl font-bold">{stats.medio}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs opacity-70">ALTO</div>
          <div className="text-xl font-bold">{stats.alto}</div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="border rounded p-3 bg-yellow-50">
          <div className="font-semibold mb-2">⚠ Alertas</div>
          <div className="space-y-2 text-sm">
            {alerts.slice(0, 10).map((r, i) => (
              <div key={`${r.day}:${r.store_id}:${r.register_id}:${i}`}>
                {r.day} · {r.store_name ?? r.store_id} · {r.register_name ?? r.register_id} ·{" "}
                <b>{levelMeta(r.risk_level, r.risk_score).text}</b> · Score {r.risk_score}
                {r.reasons?.[0] ? ` · ${r.reasons[0]}` : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla simple + motivos */}
      <div className="border rounded overflow-auto">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Día</th>
              <th className="p-2 text-left">Sucursal</th>
              <th className="p-2 text-left">Caja</th>
              <th className="p-2 text-right">Tickets</th>
              <th className="p-2 text-right">Ventas</th>
              <th className="p-2 text-right">Nivel</th>
              <th className="p-2 text-right">Score</th>
              <th className="p-2 text-left">Motivo principal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = `${r.day}:${r.store_id}:${r.register_id}`;
              const isOpen = openKey === key;
              const b = levelMeta(r.risk_level, r.risk_score);

              return (
                <Fragment key={key}>
                  <tr
                    className="cursor-pointer hover:bg-black/5"
                    onClick={() => setOpenKey(isOpen ? "" : key)}
                    title="Click para ver detalles"
                  >
                    <td className="p-2">{r.day}</td>
                    <td className="p-2">{r.store_name ?? r.store_id}</td>
                    <td className="p-2">{r.register_name ?? r.register_id}</td>
                    <td className="p-2 text-right">{r.tickets}</td>
                    <td className="p-2 text-right">${Number(r.total_sales).toFixed(2)}</td>
                    <td className="p-2 text-right">
                      <span className={`inline-flex items-center px-2 py-1 rounded border text-xs ${b.cls}`}>
                        {b.text}
                      </span>
                    </td>
                    <td className="p-2 text-right font-bold">{r.risk_score}</td>
                    <td className="p-2">
                      {r.reasons?.[0] ? r.reasons[0] : <span className="opacity-60">—</span>}
                    </td>
                  </tr>

                  {isOpen && (
                    <tr>
                      <td colSpan={8} className="p-3 bg-black/5">
                        <div className="text-sm font-semibold mb-2">Detalles</div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                          <div className="border rounded p-2 bg-white">
                            <div className="text-xs opacity-70">% Efectivo</div>
                            <div className="font-semibold">
                              {(Number(r.cash_ratio) * 100).toFixed(1)}%
                            </div>
                            <div className="text-xs opacity-70">
                              Δ vs promedio sucursal:{" "}
                              {r.cash_ratio_delta == null
                                ? "—"
                                : `${(Number(r.cash_ratio_delta) * 100).toFixed(1)} pts`}
                            </div>
                          </div>

                          <div className="border rounded p-2 bg-white">
                            <div className="text-xs opacity-70">% Vuelto</div>
                            <div className="font-semibold">
                              {(Number(r.change_ratio) * 100).toFixed(2)}%
                            </div>
                            <div className="text-xs opacity-70">
                              Δ vs promedio sucursal:{" "}
                              {r.change_ratio_delta == null
                                ? "—"
                                : `${(Number(r.change_ratio_delta) * 100).toFixed(2)} pts`}
                            </div>
                          </div>

                          <div className="border rounded p-2 bg-white">
                            <div className="text-xs opacity-70">Vueltos altos</div>
                            <div className="font-semibold">{r.high_change_tickets}</div>
                            <div className="text-xs opacity-70">
                              Ventas con vuelto ≥ 25% del total
                            </div>
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="text-sm font-semibold mb-1">Motivos</div>
                          {r.reasons?.length ? (
                            <ul className="list-disc ml-5 text-sm space-y-1">
                              {r.reasons.map((x, idx) => (
                                <li key={`${key}:reason:${idx}`}>{x}</li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-sm opacity-70">Sin motivos fuertes.</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {rows.length === 0 && !loading && (
              <tr>
                <td className="p-3 opacity-70" colSpan={8}>
                  Sin datos para el rango seleccionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs opacity-70">
        “Δ” es la diferencia contra el promedio de la sucursal ese mismo día (en puntos porcentuales).
      </div>
    </div>
  );
}
