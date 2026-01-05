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
  vat_rate: number | null; // en tu UI lo manejás como % (21)
  cost_net: number | null;
  markup_rate: number | null; // en tu UI lo manejás como % (40)
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

// Si ya tenés un sistema de roles/PIN guardado en localStorage, probamos varias keys.
// (No rompe nada: si no existe, simplemente no deja crear.)
function isSupervisorClient() {
  try {
    const v =
      localStorage.getItem("pos_role") ||
      localStorage.getItem("role") ||
      localStorage.getItem("user_role") ||
      "";
    return String(v).toLowerCase() === "supervisor";
  } catch {
    return false;
  }
}

export default function ProductsPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // modal crear producto
  const [openCreate, setOpenCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createOwn, setCreateOwn] = useState(false);
  const [createSku, setCreateSku] = useState("");
  const [createCost, setCreateCost] = useState<number>(0);
  const [createVat, setCreateVat] = useState<number>(21);
  const [createMargin, setCreateMargin] = useState<number>(0);
  const [createUnitsCase, setCreateUnitsCase] = useState<number>(1);
  const [createWeighted, setCreateWeighted] = useState(false);
  const [createInitialStock, setCreateInitialStock] = useState<number>(0);
  const [creating, setCreating] = useState(false);

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

useEffect(() => {
  if (!storeId) return;

  const t = setTimeout(() => {
    reload(storeId);
  }, 300);

  return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [query, storeId]);

  const title = useMemo(() => "Productos – Precio, IVA, Ganancia y Caja", []);

  const onSave = async (
    productId: string,
    payload: {
      newStock: number;
      cost_net: number;
      vat_rate: number;
      markup_rate: number;
      units_per_case: number;
    }
  ) => {
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

    // 2) Guardar stock por sucursal
    const resStock = await fetch("/api/stock/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId,
        productId,
        newStock: Number(payload.newStock),
      }),
    });
    const jsonStock = await resStock.json().catch(() => ({}));
    if (!jsonStock?.ok) {
      alert("Error guardando stock: " + (jsonStock?.error ?? "desconocido"));
      return;
    }

    await reload(storeId);
  };

  function resetCreateForm() {
    setCreateName("");
    setCreateOwn(false);
    setCreateSku("");
    setCreateCost(0);
    setCreateVat(21);
    setCreateMargin(0);
    setCreateUnitsCase(1);
    setCreateWeighted(false);
    setCreateInitialStock(0);
  }

  async function handleCreate() {
    if (!storeId) return;

    // SOLO supervisor
    if (!isSupervisorClient()) {
      alert("Solo supervisor puede crear productos (verificá tu PIN/rol).");
      return;
    }

    const name = createName.trim();
    if (!name) {
      alert("Falta nombre");
      return;
    }
    if (!createOwn && !createSku.trim()) {
      alert("Falta SKU (para productos no propios)");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/products/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          is_own: createOwn,
          sku: createOwn ? null : createSku.trim(),
          cost_net: Number(createCost),
          vat_rate: Number(createVat),
          markup_rate: Number(createMargin),
          units_per_case: Math.max(1, Number(createUnitsCase)),
          is_weighted: Boolean(createWeighted),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!json?.ok) {
        alert("Error creando producto: " + (json?.error ?? "desconocido"));
        return;
      }

      const productId = json?.product?.id as string | undefined;
      if (productId && Number(createInitialStock) !== 0) {
        const resStock = await fetch("/api/stock/adjust", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId,
            productId,
            newStock: Number(createInitialStock),
          }),
        });
        const jsonStock = await resStock.json().catch(() => ({}));
        if (!jsonStock?.ok) {
          alert("Producto creado, pero falló stock: " + (jsonStock?.error ?? "desconocido"));
          // igual seguimos
        }
      }

      setOpenCreate(false);
      resetCreateForm();
      await reload(storeId);
    } finally {
      setCreating(false);
    }
  }

  const createPreviewFinal = useMemo(() => {
    return calcFinalPrice(n(createCost, 0), n(createVat, 21), n(createMargin, 0));
  }, [createCost, createVat, createMargin]);

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
  onKeyDown={(e) => {
    if (e.key === "Enter") reload(storeId);
  }}
/>
        </div>

        <button
          className="bg-black text-white rounded px-4 py-2"
          onClick={() => reload(storeId)}
          disabled={loading}
        >
          {loading ? "Cargando..." : "Refrescar"}
        </button>

        <button
          className="bg-emerald-600 text-white rounded px-4 py-2"
          onClick={() => {
            // SOLO supervisor
            if (!isSupervisorClient()) {
              alert("Solo supervisor puede crear productos (verificá tu PIN/rol).");
              return;
            }
            setOpenCreate(true);
          }}
        >
          Crear producto
        </button>
      </div>

      <div className="border rounded bg-white shadow-sm">
<div className="overflow-auto max-h-[calc(100vh-180px)]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-20">
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
<th className="p-2 sticky right-0 bg-gray-50 z-30 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.25)]"></th>
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

      {/* Modal Crear */}
      {openCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpenCreate(false)} />
          <div className="relative w-full max-w-xl bg-white rounded-lg shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Crear producto</h2>
              <button className="px-3 py-1 rounded border" onClick={() => setOpenCreate(false)}>
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm">Nombre</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Ej: Pan de hamburguesa"
                />
              </div>

              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createOwn}
                  onChange={(e) => setCreateOwn(e.target.checked)}
                />
                <span className="text-sm">Producto propio (SKU automático)</span>
              </div>

              {!createOwn && (
                <div className="col-span-2">
                  <label className="text-sm">SKU (código de barras)</label>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={createSku}
                    onChange={(e) => setCreateSku(e.target.value)}
                    placeholder="Ej: 779..."
                  />
                </div>
              )}

              <div>
                <label className="text-sm">Costo neto</label>
                <input
                  className="border rounded px-3 py-2 w-full text-right"
                  value={String(createCost)}
                  onChange={(e) => setCreateCost(n(e.target.value, 0))}
                />
              </div>

              <div>
                <label className="text-sm">IVA %</label>
                <input
                  className="border rounded px-3 py-2 w-full text-right"
                  value={String(createVat)}
                  onChange={(e) => setCreateVat(n(e.target.value, 21))}
                />
              </div>

              <div>
                <label className="text-sm">Margen %</label>
                <input
                  className="border rounded px-3 py-2 w-full text-right"
                  value={String(createMargin)}
                  onChange={(e) => setCreateMargin(n(e.target.value, 0))}
                />
              </div>

              <div>
                <label className="text-sm">Unid/caja</label>
                <input
                  className="border rounded px-3 py-2 w-full text-right"
                  value={String(createUnitsCase)}
                  onChange={(e) => setCreateUnitsCase(Math.max(1, n(e.target.value, 1)))}
                />
              </div>

              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createWeighted}
                  onChange={(e) => setCreateWeighted(e.target.checked)}
                />
                <span className="text-sm">Producto pesado (kg)</span>
              </div>

              <div>
                <label className="text-sm">Stock inicial (esta sucursal)</label>
                <input
                  className="border rounded px-3 py-2 w-full text-right"
                  value={String(createInitialStock)}
                  onChange={(e) => setCreateInitialStock(n(e.target.value, 0))}
                />
              </div>

              <div>
                <label className="text-sm">Precio final (preview)</label>
                <div className="border rounded px-3 py-2 w-full text-right font-semibold">
                  {money(createPreviewFinal)}
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2 justify-end">
              <button
                className="px-4 py-2 rounded border"
                onClick={() => {
                  setOpenCreate(false);
                  resetCreateForm();
                }}
                disabled={creating}
              >
                Cancelar
              </button>

              <button
                className="px-4 py-2 rounded bg-black text-white"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? "Creando..." : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}
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
  const priceCase = useMemo(
    () => Math.round(priceFinal * Math.max(1, unitsCase) * 100) / 100,
    [priceFinal, unitsCase]
  );

  return (
    <tr className="border-t">
      <td className="p-2 max-w-[260px]">
        <div className="truncate" title={row.name}>
          {row.name}
        </div>
      </td>

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

      <td className="p-2 text-right font-semibold">{money(n((row as any).price, priceFinal))}</td>

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

<td className="p-2 text-right sticky right-0 bg-white z-20 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.25)]">
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
