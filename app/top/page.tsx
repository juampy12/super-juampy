"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Store = { id: string; name: string };
type TopRow = { product_id:string; sku:string; name:string; qty:number; revenue:number; tickets:number };

function rangeToDates(tag:string): {from:Date; to:Date} {
  const now = new Date();
  const startOfDay = (d:Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch(tag){
    case "today": {
      const from = startOfDay(now);
      const to   = new Date(from); to.setDate(to.getDate()+1);
      return { from, to };
    }
    case "yesterday": {
      const to = startOfDay(now);
      const from = new Date(to); from.setDate(from.getDate()-1);
      return { from, to };
    }
    case "7d": {
      const to = now;
      const from = new Date(to); from.setDate(from.getDate()-7);
      return { from, to };
    }
    case "month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to   = new Date(now.getFullYear(), now.getMonth()+1, 1);
      return { from, to };
    }
    default: {
      const to = now;
      const from = new Date(to); from.setDate(from.getDate()-7);
      return { from, to };
    }
  }
}

export default function TopProductsPage(){
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [range, setRange] = useState<"7d"|"today"|"yesterday"|"month">("7d");
  const [rows, setRows] = useState<TopRow[]>([]);
  const [loading, setLoading] = useState(false);

  // cargar sucursales
  useEffect(() => {
    supabase.from("stores").select("id,name").order("name", { ascending: true })
      .then(({ data }) => {
        setStores(data ?? []);
        if ((data?.length ?? 0) > 0 && !storeId) setStoreId(data![0].id);
      });
  }, []);

  const {from, to} = useMemo(() => rangeToDates(range), [range]);

  const load = async () => {
    if (!from || !to) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("products_top", {
      p_from: from.toISOString(),
      p_to:   to.toISOString(),
      p_store: storeId || null,
      p_limit: 50
    });
    if (!error) setRows((data ?? []) as TopRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* auto-load on filters change */ }, [storeId, range]);

  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="text-3xl font-semibold mb-6">Top productos</h1>

      <div className="flex flex-wrap gap-3 items-end mb-6">
        <div>
          <label className="block text-sm mb-1">Sucursal</label>
          <select className="border rounded px-3 py-2" value={storeId} onChange={e => setStoreId(e.target.value)}>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">Rango</label>
          <select className="border rounded px-3 py-2" value={range} onChange={e => setRange(e.target.value as any)}>
            <option value="7d">Últimos 7 días</option>
            <option value="today">Hoy</option>
            <option value="yesterday">Ayer</option>
            <option value="month">Este mes</option>
          </select>
        </div>

        <button
          className="px-4 py-2 rounded bg-black text-white"
          onClick={load}
          disabled={loading}
        >
          {loading ? "Cargando..." : "Refrescar"}
        </button>
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2">#</th>
              <th className="text-left p-2">SKU</th>
              <th className="text-left p-2">Producto</th>
              <th className="text-right p-2">Unidades</th>
              <th className="text-right p-2">Ingresos</th>
              <th className="text-right p-2">Tickets</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-gray-500">Sin datos en esta ventana.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.product_id} className="border-t">
                <td className="p-2">{i+1}</td>
                <td className="p-2">{r.sku}</td>
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right">{Number(r.qty ?? 0).toLocaleString()}</td>
                <td className="p-2 text-right">
                  ${Number(r.revenue ?? 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
                </td>
                <td className="p-2 text-right">{Number(r.tickets ?? 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
