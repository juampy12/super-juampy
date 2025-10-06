"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Row = {
  date: string;        // YYYY-MM-DD
  sales_count: number;
  units: number;
  total: number;
};

const fmt = new Intl.NumberFormat("es-AR");
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });

export default function SalesDaily() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null); setLoading(true);
    const { data, error } = await supabase
      .from("v_sales_daily")
      .select("*")
      .order("date", { ascending: false })
      .limit(14);
    if (error) setErr(error.message);
    if (data) setRows(data as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="border rounded p-3">
      <h3 className="font-semibold mb-2">Totales diarios</h3>

      {err && <div className="bg-red-100 text-red-700 px-2 py-1 rounded mb-2">{err}</div>}
      {loading ? (
        <div>Cargando…</div>
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
            {rows.map((r) => (
              <tr key={r.date} className="border-b">
                <td className="py-1">{r.date}</td>
                <td className="py-1">{fmt.format(r.sales_count)}</td>
                <td className="py-1">{fmt.format(r.units)}</td>
                <td className="py-1">{money.format(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button onClick={load} className="mt-3 px-3 py-1 rounded bg-black text-white">Refrescar</button>
    </div>
  );
}
