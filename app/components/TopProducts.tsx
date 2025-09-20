﻿"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type TopItem = {
  product_id: string;
  name: string;
  sku: string | null;
  qty_sold: number;
  last_sold_at: string | null;
};

export default function TopProducts({ storeId }: { storeId: string | null | undefined }) {
  const [topDays, setTopDays] = useState<number>(7);
  const [items, setItems] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTop = async () => {
    if (!storeId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("fn_top_products", {
      p_store: storeId,
      p_days: topDays,
      p_limit: 8,
    });
    if (!error) setItems((data || []) as TopItem[]);
    setLoading(false);
  };

  useEffect(() => { loadTop(); }, [storeId, topDays]);

  const quickAddFromTop = (it: TopItem) => {
    const input = document.querySelector(
      'input[placeholder="Escaneá o escribí código o nombre"]'
    ) as HTMLInputElement | null;
    if (!input) return;
    input.focus();
    input.value = (it.sku ?? it.name) || it.name;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  return (
    <div className="mt-4 border rounded-xl p-3">
      <div className="flex items-center gap-3 mb-2">
        <h3 className="font-semibold">Top de productos</h3>
        <select
          value={topDays}
          onChange={(e) => setTopDays(Number(e.target.value))}
          className="border rounded-lg px-2 py-1 text-sm"
          aria-label="Ventana top"
          title="Ventana de tiempo"
        >
          <option value={7}>Últimos 7 días</option>
          <option value={14}>Últimos 14 días</option>
          <option value={30}>Últimos 30 días</option>
        </select>
        <button onClick={loadTop} className="text-sm border px-2 py-1 rounded-lg">↻ Refrescar</button>
      </div>

      {loading ? (
        <div className="text-sm opacity-60">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="text-sm opacity-60">Sin datos en esta ventana.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <button
              key={it.product_id}
              onClick={() => quickAddFromTop(it)}
              className="px-3 py-2 rounded-2xl border hover:bg-gray-50 text-left"
              title={it.last_sold_at ? `Última venta: ${new Date(it.last_sold_at).toLocaleString()}` : ""}
            >
              <div className="font-medium">{it.name}</div>
              <div className="text-xs opacity-70">Vendidos: {Number(it.qty_sold).toFixed(0)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
