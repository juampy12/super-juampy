"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Store = { id: string; name: string };
type ProductRow = { id: string; sku: string | null; name: string };

export default function MinimosPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductRow[]>([]);
  const [minValue, setMinValue] = useState<Record<string, string>>({});
const [minByProduct, setMinByProduct] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("stores")
      .select("id,name")
      .order("name", { ascending: true })
      .then(({ data }) => {
        const list = (data ?? []) as Store[];
        setStores(list);
        if (list.length && !storeId) setStoreId(list[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search() {
    const term = q.trim();
    if (!storeId) return alert("Elegí una sucursal.");
    if (!term) return alert("Escribí nombre o SKU.");

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id,sku,name")
        .or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
        .order("name", { ascending: true })
        .limit(50);

      if (error) {
        console.error(error);
        alert("Error buscando productos: " + error.message);
        return;
      }

      const list = (data ?? []) as ProductRow[];
      setResults(list);
      await loadMins(list.map((p) => p.id));
    } finally {
      setLoading(false);
    }
  }
  async function loadMins(productIds: string[]) {
    if (!storeId || productIds.length === 0) return;

    const { data, error } = await supabase
      .from("product_min_stock")
      .select("product_id,min_stock")
      .eq("store_id", storeId)
      .in("product_id", productIds);

    if (error) {
      console.error(error);
      return;
    }

    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      map[row.product_id] = String(row.min_stock ?? "");
    }

    setMinValue((prev) => ({ ...prev, ...map }));
    setMinByProduct(map);
  }
  async function saveMin(productId: string) {
    if (!storeId) return alert("Elegí una sucursal.");

    const raw = (minValue[productId] ?? "").trim();
    const n = Number(raw);
    if (Number.isNaN(n) || n < 0) return alert("Mínimo inválido (>= 0).");

    const { error } = await supabase.rpc("set_min_stock", {
      p_store: storeId,
      p_product: productId,
      p_min: n,
    });

    if (error) {
      console.error(error);
      alert("Error guardando mínimo: " + error.message);
      return;
    }

    alert("✅ Mínimo guardado.");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Stock mínimo</h1>
      <p className="text-sm text-neutral-600">
        Configurá el mínimo por producto y sucursal para que aparezca en “Stock bajo”.
      </p>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <label className="text-sm font-medium">Sucursal</label>
          <select
            className="border rounded px-3 py-2"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Buscar producto</label>
          <input
            className="border rounded px-3 py-2 w-72"
            placeholder="Nombre o SKU"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") search();
            }}
          />
        </div>

        <button
          onClick={search}
          className="px-4 py-2 rounded bg-black text-white"
          disabled={loading}
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>

      <div className="border rounded overflow-hidden">
        {results.length === 0 ? (
          <div className="p-4 text-sm text-neutral-600">Sin resultados.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-3">Producto</th>
                <th className="py-2 px-3">SKU</th>
                <th className="py-2 px-3 w-40">Mínimo</th>
                <th className="py-2 px-3 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {results.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2 px-3">{p.name}</td>
                  <td className="py-2 px-3">{p.sku ?? "-"}</td>
                  <td className="py-2 px-3">
                    <input
                      className="border rounded px-2 py-1 w-32"
                      placeholder="Ej: 5"
                      value={minValue[p.id] ?? ""}
                      onChange={(e) =>
                        setMinValue((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    />
                  </td>
                  <td className="py-2 px-3">
                    <button
                      className="px-3 py-1 rounded border"
                      onClick={() => saveMin(p.id)}
                    >
                      Guardar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
