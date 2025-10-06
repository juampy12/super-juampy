"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Store = { id: string; name: string };
type Row = { id: string; sku: string; name: string; price: number; stock: number };

export default function ProductsByStorePage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [nameFilter, setNameFilter] = useState("");
  const [refreshTick, setRefreshTick] = useState(0); // 👈 FIX refrescar

  // carga sucursales
  useEffect(() => {
    supabase.from("stores").select("id,name").order("name", { ascending: true })
      .then(({ data }) => {
        setStores(data ?? []);
        if ((data?.length ?? 0) > 0 && !storeId) setStoreId(data![0].id);
      });
  }, []);

  // carga productos con stock por sucursal (RPC)
  useEffect(() => {
    const load = async () => {
      if (!storeId) return;
      setLoading(true);
      const q = nameFilter?.trim() || null;
      const { data, error } = await supabase.rpc("products_with_stock", {
        p_store: storeId,
        p_query: q,
        p_limit: 500
      });
      if (!error) setRows((data ?? []) as Row[]);
      setLoading(false);
    };
    load();
  }, [storeId, nameFilter, refreshTick]); // 👈 ahora escucha refreshTick

  const onSave = async (productId: string, newValue: number) => {
    if (!storeId) return;
    const body = { storeId, productId, newStock: Number(newValue) };
    const res = await fetch("/api/stock/adjust", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json?.ok) {
      alert("Error: " + (json?.error ?? "desconocido"));
      return;
    }
    // recargar
    const { data } = await supabase.rpc("products_with_stock", { p_store: storeId, p_query: null, p_limit: 500 });
    setRows((data ?? []) as Row[]);
  };

  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="text-2xl font-semibold mb-4">Productos & Stock por sucursal</h1>

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <label className="block text-sm mb-1">Sucursal</label>
          <select
            className="border rounded px-3 py-2"
            value={storeId}
            onChange={e => setStoreId(e.target.value)}
          >
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">Nombre</label>
          <input
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setRefreshTick(t => t + 1); }} // 👈 enter también refresca
            className="border rounded px-3 py-2"
            placeholder="Filtrar por nombre o SKU"
          />
        </div>

        <button
          className="px-4 py-2 rounded bg-black text-white"
          onClick={() => setRefreshTick(t => t + 1)} // 👈 ahora sí refresca
          disabled={loading}
        >
          {loading ? "Cargando..." : "Refrescar"}
        </button>
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2">Nombre</th>
              <th className="text-left p-2">SKU</th>
              <th className="text-left p-2">Precio</th>
              <th className="text-left p-2">Actual (DB)</th>
              <th className="text-left p-2">Nuevo</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <RowLine key={r.id} row={r} onSave={(v) => onSave(r.id, v)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowLine({ row, onSave }:{ row:Row; onSave:(value:number)=>void }) {
  const [value, setValue] = useState<number>(row.stock ?? 0);
  useEffect(() => setValue(row.stock ?? 0), [row.stock]);

  return (
    <tr className="border-t">
      <td className="p-2">{row.name}</td>
      <td className="p-2">{row.sku}</td>
      <td className="p-2">${Number(row.price ?? 0).toFixed(2)}</td>
      <td className="p-2">{Number(row.stock ?? 0)}</td>
      <td className="p-2">
        <input
          type="number"
          className="border rounded px-2 py-1 w-24"
          value={String(value)}
          onChange={e => setValue(Number(e.target.value))}
        />
      </td>
      <td className="p-2">
        <button
          className="px-3 py-1 rounded bg-black text-white"
          onClick={() => onSave(value)}
        >
          Guardar
        </button>
      </td>
    </tr>
  );
}
