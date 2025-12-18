"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Store = { id: string; name: string };

type Row = {
  id: string;
  sku: string | null;
  name: string;
  price: number | null;

  stock: number | null;
  unit_label: string | null;

  units_per_case: number | null;
  vat_rate: number | null;
  cost_net: number | null;
  markup_rate: number | null;
};

function n(v: any, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function money(v: number) {
  return `$${(Math.round(v * 100) / 100).toFixed(2)}`;
}

function calcFinalPrice(costNet: number, vatRate: number, markupRate: number) {
  const withVat = costNet * (1 + vatRate / 100);
  const withMarkup = withVat * (1 + markupRate / 100);
  return Math.round(withMarkup * 100) / 100;
}

export default function ProductsPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  async function reload(pStore?: string) {
    const sid = pStore ?? storeId;
    if (!sid) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("products_with_stock", {
        p_store: sid,
        p_query: query || null,
        p_limit: 500,
      });
      if (error) throw error;
      setRows((data ?? []) as Row[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("stores").select("id,name").order("name");
      const list = (data ?? []) as Store[];
      setStores(list);
      if (!storeId && list[0]?.id) setStoreId(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!storeId) return;
    reload(storeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const title = useMemo(() => "Productos – Precio, IVA, Ganancia y Caja", []);

  const onSave = async (productId: string, payload: {
    newStock: number;
    cost_net: number;
    vat_rate: number;
    markup_rate: number;
    units_per_case: number;
  }) => {
    if (!storeId) return;

    // 1) Guardar precio/iva/margen/unidades por caja (y recalcula price)
    const resPrice = await fetch("/api/products/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, ...payload }),
    });
    const jsonPrice = await resPrice.json().catch(() => ({}));
    if (!jsonPrice?.ok) {
      alert("Error guardando precio: " + (jsonPrice?.error ?? "desconocido"));
      return;
    }

    // 2) Guardar stock por sucursal (lo que ya tenías)
    const resStock = await fetch("/api/stock/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId, productId, newStock: Number(payload.newStock) }),
    });
    const jsonStock = await resStock.json().catch(() => ({}));
    if (!jsonStock?.ok) {
      alert("Error guardando stock: " + (jsonStock?.error ?? "desconocido"));
      return;
    }

    // recargar tabla
    await reload(storeId);
  };

  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="text-2xl font-semibold mb-4">{title}</h1>

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div className="flex flex-col">
          <label className="text-sm mb-1">Sucursal</label>
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

        <div className="flex flex-col">
          <label className="text-sm mb-1">Buscar</label>
          <input
            className="border rounded px-3 py-2 w-72"
            placeholder="Buscar nombre o SKU"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <button
          className="bg-black text-white rounded px-4 py-2"
          onClick={() => reload(storeId)}
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
              <th className="text-right p-2">Costo</th>
              <th className="text-right p-2">IVA %</th>
              <th className="text-right p-2">Margen %</th>
              <th className="text-right p-2">Precio Final (u)</th>
              <th className="text-right p-2">Unid/caja</th>
              <th className="text-right p-2">Precio Caja</th>
              <th className="text-right p-2">Stock</th>
              <th className="text-right p-2">Nuevo</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <RowLine key={r.id} row={r} onSave={(v) => onSave(r.id, v)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowLine({
  row,
  onSave,
}: {
  row: Row;
  onSave: (payload: {
    newStock: number;
    cost_net: number;
    vat_rate: number;
    markup_rate: number;
    units_per_case: number;
  }) => void;
}) {
  const [newStock, setNewStock] = useState<number>(n(row.stock, 0));

  const [cost, setCost] = useState<number>(n(row.cost_net, 0));
  const [vat, setVat] = useState<number>(n(row.vat_rate, 21));
  const [margin, setMargin] = useState<number>(n(row.markup_rate, 0));
  const [unitsCase, setUnitsCase] = useState<number>(Math.max(1, n(row.units_per_case, 1)));

  useEffect(() => setNewStock(n(row.stock, 0)), [row.stock]);
  useEffect(() => setCost(n(row.cost_net, 0)), [row.cost_net]);
  useEffect(() => setVat(n(row.vat_rate, 21)), [row.vat_rate]);
  useEffect(() => setMargin(n(row.markup_rate, 0)), [row.markup_rate]);
  useEffect(() => setUnitsCase(Math.max(1, n(row.units_per_case, 1))), [row.units_per_case]);

  const priceFinal = useMemo(() => calcFinalPrice(cost, vat, margin), [cost, vat, margin]);
  const priceCase = useMemo(() => Math.round(priceFinal * Math.max(1, unitsCase) * 100) / 100, [priceFinal, unitsCase]);

  return (
    <tr className="border-t">
      <td className="p-2">{row.name}</td>
      <td className="p-2">{row.sku ?? "-"}</td>

      <td className="p-2 text-right">
        <input
          className="border rounded px-2 py-1 w-24 text-right"
          value={String(cost)}
          onChange={(e) => setCost(n(e.target.value, 0))}
        />
      </td>

      <td className="p-2 text-right">
        <input
          className="border rounded px-2 py-1 w-16 text-right"
          value={String(vat)}
          onChange={(e) => setVat(n(e.target.value, 0))}
        />
      </td>

      <td className="p-2 text-right">
        <input
          className="border rounded px-2 py-1 w-16 text-right"
          value={String(margin)}
          onChange={(e) => setMargin(n(e.target.value, 0))}
        />
      </td>

      <td className="p-2 text-right font-semibold">{money(priceFinal)}</td>

      <td className="p-2 text-right">
        <input
          className="border rounded px-2 py-1 w-20 text-right"
          value={String(unitsCase)}
          onChange={(e) => setUnitsCase(Math.max(1, n(e.target.value, 1)))}
        />
      </td>

      <td className="p-2 text-right">{money(priceCase)}</td>

      <td className="p-2 text-right">
        {n(row.stock, 0)} {row.unit_label ?? "u"}
      </td>

      <td className="p-2 text-right">
        <input
          className="border rounded px-2 py-1 w-20 text-right"
          value={String(newStock)}
          onChange={(e) => setNewStock(n(e.target.value, 0))}
        />
      </td>

      <td className="p-2 text-right">
        <button
          className="bg-black text-white rounded px-4 py-2"
          onClick={() =>
            onSave({
              newStock,
              cost_net: cost,
              vat_rate: vat,
              markup_rate: margin,
              units_per_case: unitsCase,
            })
          }
        >
          Guardar
        </button>
      </td>
    </tr>
  );
}
