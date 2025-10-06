"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Row = {
  sale_id: string;
  created_at_utc: string;
  created_at_local: string;
  items: number;
  total: number;
};

const fmt = new Intl.NumberFormat("es-AR");
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });

export default function SalesBySale() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null); setLoading(true);
    const { data, error } = await supabase
      .from("v_sales")
      .select("*")
      .order("created_at_local", { ascending: false })
      .limit(20);

    if (error) setErr(error.message);
    if (data) setRows(data as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="border rounded p-3">
      <h3 className="font-semibold mb-2">Totales por venta</h3>

      {err && <div className="bg-red-100 text-red-700 px-2 py-1 rounded mb-2">{err}</div>}
      {loading ? (
        <div>Cargando…</div>
      ) : rows.length === 0 ? (
        <div>Sin datos.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Fecha (Córdoba)</th>
              <th className="py-1">Venta</th>
              <th className="py-1">Items</th>
              <th className="py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sale_id} className="border-b">
                <td className="py-1">{new Date(r.created_at_local).toLocaleString("es-AR")}</td>
                <td className="py-1">{r.sale_id}</td>
                <td className="py-1">{fmt.format(r.items)}</td>
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
