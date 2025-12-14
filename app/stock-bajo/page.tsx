"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Store = { id: string; name: string };

type Row = {
  id: string;
  sku: string | null;
  name: string;
  price: number | null;
  stock: number;
  min_stock: number;
  missing: number;
};

export default function StockBajoPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("stores")
      .select("id,name")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          alert("Error cargando sucursales: " + error.message);
          return;
        }
        const list = (data ?? []) as Store[];
        setStores(list);
        if (list.length && !selectedStoreId) setSelectedStoreId(list[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    if (!selectedStoreId) {
      alert("Elegí una sucursal.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("low_stock_products", {
        p_store: selectedStoreId,
        p_query: query.trim() || null,
        p_limit: 200,
      });

      if (error) {
        console.error(error);
        alert("Error buscando stock bajo: " + error.message);
        return;
      }
      setRows((data ?? []) as Row[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedStoreId) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);

  const totalMissing = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.missing) || 0), 0),
    [rows]
  );

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Stock bajo</h1>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <div className="text-sm text-neutral-600">Sucursal</div>
          <select
            className="border rounded px-3 py-2"
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <div className="text-sm text-neutral-600">Buscar</div>
          <input
            className="border rounded px-3 py-2 w-64"
            placeholder="Nombre o SKU"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void refresh();
            }}
          />
        </div>

        <button
          className="rounded bg-black text-white px-4 py-2"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "Buscando..." : "Actualizar"}
        </button>

        <div className="ml-auto text-sm text-neutral-700">
          Items: <b>{rows.length}</b> · Faltante total: <b>{totalMissing}</b>
        </div>
      </div>

      <div className="border rounded bg-white overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-4 text-sm text-neutral-600">
            No hay productos por debajo del mínimo (o no configuraste mínimos).
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-3">Producto</th>
                <th className="py-2 px-3">SKU</th>
                <th className="py-2 px-3 text-right">Stock</th>
                <th className="py-2 px-3 text-right">Mínimo</th>
                <th className="py-2 px-3 text-right">Faltan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
<tr
  key={r.id}
  className={[
    "border-b last:border-0",
    Number(r.missing) > 0 ? "bg-red-50" : "",
  ].join(" ")}
>
<td className="py-2 px-3">
  <div className="flex items-center gap-2">
    <span>{r.name}</span>
    {Number(r.missing) > 0 && (
      <span className="text-[11px] px-2 py-0.5 rounded-full border border-red-200 bg-white text-red-700">
        ⚠ Stock bajo
      </span>
    )}
  </div>
</td>
                  <td className="py-2 px-3">{r.sku ?? "-"}</td>
                  <td className="py-2 px-3 text-right">{Number(r.stock).toFixed(2)}</td>
                  <td className="py-2 px-3 text-right">{Number(r.min_stock).toFixed(2)}</td>
<td
  className={[
    "py-2 px-3 text-right font-medium",
    Number(r.missing) > 0 ? "text-red-700" : "",
  ].join(" ")}
>
  {Number(r.missing).toFixed(2)}
</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-neutral-500">
        Nota: para que aparezcan alertas, primero tenés que configurar “mínimo” por producto y sucursal.
      </div>
    </div>
  );
}
