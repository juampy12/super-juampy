"use client";

import { useEffect, useState } from "react";

type Row = {
  day?: string;
  date?: string;
  tickets?: number;
  sales_count?: number;
  units?: number;
  total?: number;
  total_sales?: number;
  revenue?: number;
};

const fmt = new Intl.NumberFormat("es-AR");
const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

function getDay(row: Row) {
  return row.day ?? row.date ?? "";
}

function getTotal(row: Row) {
  return Number(row.revenue ?? row.total_sales ?? row.total ?? 0);
}

export default function SalesDaily() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/reports/summary", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Error cargando reporte");
      setRows(((json.rows ?? []) as Row[]).slice(-14).reverse());
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="border rounded p-3">
      <h3 className="font-semibold mb-2">Totales diarios</h3>

      {err && <div className="bg-red-100 text-red-700 px-2 py-1 rounded mb-2">{err}</div>}
      {loading ? (
        <div>Cargando...</div>
      ) : rows.length === 0 ? (
        <div>Sin datos.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Fecha</th>
              <th className="py-1">Ventas</th>
              <th className="py-1">Unidades</th>
              <th className="py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={`${getDay(r)}-${idx}`} className="border-b">
                <td className="py-1">{getDay(r)}</td>
                <td className="py-1">{fmt.format(Number(r.tickets ?? r.sales_count ?? 0))}</td>
                <td className="py-1">{fmt.format(Number(r.units ?? 0))}</td>
                <td className="py-1">{money.format(getTotal(r))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button onClick={load} className="mt-3 px-3 py-1 rounded bg-black text-white">
        Refrescar
      </button>
    </div>
  );
}
