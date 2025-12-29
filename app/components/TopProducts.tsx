"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type TopItem = {
  product_id: string;
  name: string;
  sku: string | null;
  qty_sold: number;
  total_amount: number | null;
  stock: number | null;
  last_sold_at: string | null;
};

type Props = {
  storeId: string | null | undefined; // null => todas
  from?: string;
  to?: string;
};

export default function TopProducts({ storeId, from, to }: Props) {
  const [items, setItems] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(false);

  const hasDates = Boolean(from && to);

const loadTop = async () => {
  // Regla: solo funciona con fechas
  if (!from || !to) {
    setItems([]);
    setLoading(false);
    return;
  }

  setLoading(true);

  const resp =
    storeId && storeId.length > 0
      ? await supabase.rpc("fn_top_products_range", {
          p_store: storeId,
          p_from: from,
          p_to: to,
          p_limit: 8,
        })
      : await supabase.rpc("fn_top_products_range_all", {
          p_from: from,
          p_to: to,
          p_limit: 8,
        });

  if (!resp.error) {
    setItems(((resp.data || []) as TopItem[]) ?? []);
  } else {
    console.error("Error cargando top productos", resp.error);
    setItems([]);
  }

  setLoading(false);
};

  useEffect(() => {
    loadTop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, from, to]);

  const quickAddFromTop = (it: TopItem) => {
    const input = document.querySelector(
      'input[placeholder="Escaneá o escribí código o nombre"]'
    ) as HTMLInputElement | null;
    if (!input) return;
    input.focus();
    input.value = (it.sku ?? it.name) || it.name;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const maxQty = Math.max(...items.map((x) => Number(x.qty_sold ?? 0)), 0);

  const fmtInt = (v: number) => new Intl.NumberFormat("es-AR").format(v);
  const fmtMoney = (v: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(v);

  const stockBadge = (stock: number) => {
    if (stock <= 0)
      return { label: "Sin stock", cls: "bg-red-100 text-red-800 border-red-200" };
    if (stock <= 5)
      return { label: "Stock bajo", cls: "bg-yellow-100 text-yellow-800 border-yellow-200" };
    return { label: "OK", cls: "bg-green-100 text-green-800 border-green-200" };
  };

  // ✅ Regla visual: si no hay fechas, no mostramos el top
  if (!hasDates) {
    return (
      <div className="mt-4 border rounded-xl p-4 bg-white w-full text-sm text-neutral-600">
        Seleccioná <b>Desde</b> y <b>Hasta</b> para ver el top de productos.
      </div>
    );
  }

  return (
    <div className="mt-4 border rounded-xl p-4 bg-white w-full">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h3 className="font-semibold text-lg">Top de productos</h3>

        <button
          onClick={loadTop}
          className="text-sm border px-3 py-1 rounded-lg"
          disabled={loading}
          title="Refrescar"
        >
          ↻ {loading ? "Cargando…" : "Refrescar"}
        </button>

        {from && to && (
          <div className="text-xs text-neutral-500">
            Rango: {from} a {to}
          </div>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="text-sm opacity-60">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="text-sm opacity-60">Sin datos en este rango.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((it, idx) => {
            const qty = Number(it.qty_sold ?? 0);
            const pct = maxQty > 0 ? Math.round((qty / maxQty) * 100) : 0;
            const rank = idx + 1;

            const totalAmount = Number(it.total_amount ?? 0);
            const stock = Number(it.stock ?? 0);
            const badge = stockBadge(stock);

            return (
              <button
                key={it.product_id}
                onClick={() => quickAddFromTop(it)}
                className="group text-left border rounded-xl p-4 hover:bg-gray-50 transition"
              >
                {/* Ranking + nombre */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-neutral-500 mb-1">
                      #{rank}{" "}
                      {rank <= 3 ? (rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉") : ""}
                    </div>
                    <div className="font-semibold truncate" title={it.name}>
                      {it.name}
                    </div>
                    <div className="text-xs text-neutral-500 truncate">
                      {it.sku ? `SKU: ${it.sku}` : "SKU: -"}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-neutral-500">Vendidos</div>
                    <div className="text-2xl font-bold tabular-nums">{fmtInt(qty)}</div>
                  </div>
                </div>

                {/* Facturación + Stock */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="border rounded-lg p-2">
                    <div className="text-[11px] text-neutral-500">Facturación</div>
                    <div className="font-semibold">{fmtMoney(totalAmount)}</div>
                  </div>
                  <div className="border rounded-lg p-2">
                    <div className="text-[11px] text-neutral-500">Stock</div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{fmtInt(stock)}</div>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Barra */}
                <div className="mt-3">
                  <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
                    <div className="h-2 bg-neutral-900 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-500">{pct}% vs el #1</div>
                </div>

                <div className="mt-3 text-xs text-neutral-600 opacity-0 group-hover:opacity-100 transition">
                  Click para cargarlo en el POS
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
