"use client";

import { useEffect, useState } from "react";

type Sale = {
  id: string;
  created_at: string;
  total: number;
};

type Item = {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
};

type PreviewSale = Sale & { items: Item[] };

export default function SalesPreview() {
  const [sales, setSales] = useState<PreviewSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    setLoading(true);
    try {
      const salesRes = await fetch("/api/sales", { cache: "no-store" });
      const salesJson = await salesRes.json().catch(() => ({}));
      if (!salesRes.ok) throw new Error(salesJson?.error ?? "Error cargando ventas");

      const recent = ((salesJson.data ?? []) as Sale[]).slice(0, 5);
      const withItems = await Promise.all(
        recent.map(async (sale) => {
          const params = new URLSearchParams({ sale_id: sale.id });
          const itemsRes = await fetch(`/api/sales/items?${params.toString()}`, { cache: "no-store" });
          const itemsJson = await itemsRes.json().catch(() => ({}));
          return { ...sale, items: itemsRes.ok ? ((itemsJson.data ?? []) as Item[]) : [] };
        })
      );
      setSales(withItems);
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
      {err && <div className="bg-red-100 text-red-700 px-2 py-1 rounded mb-2">{err}</div>}
      {loading ? (
        <div>Cargando...</div>
      ) : sales.length === 0 ? (
        <div>Sin registros recientes.</div>
      ) : (
        <ul className="space-y-2">
          {sales.map((sale) => (
            <li key={sale.id} className="border rounded p-2">
              <div className="text-sm text-gray-600">{new Date(sale.created_at).toLocaleString("es-AR")}</div>
              <div>
                <b>Venta:</b> {sale.id}
              </div>
              {sale.items.length ? (
                <ul className="mt-2 space-y-1">
                  {sale.items.map((it) => (
                    <li key={`${sale.id}-${it.product_id}`}>
                      {it.name} x {it.quantity} - ${it.unit_price}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-gray-500">Sin detalle de items.</div>
              )}
            </li>
          ))}
        </ul>
      )}
      <button onClick={load} className="mt-3 px-3 py-1 rounded bg-black text-white">
        Refrescar
      </button>
    </div>
  );
}
