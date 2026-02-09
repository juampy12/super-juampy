"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Store = { id: string; name: string };

type Row = {
  id: string;
  sku: string | null;
  name: string;
  price: number | null;

  // viene de la RPC pero NO se muestra ni se edita acá
  units_per_case: number | null;

  vat_rate: number | null;
  cost_net: number | null;
  markup_rate: number | null;
};

type DirtyPayload = {
  cost_net: number;
  vat_rate: number;
  markup_rate: number;

  // compatibilidad backend (no se edita)
  units_per_case: number;

  use_final_price?: boolean;
  final_price?: number | null;
};

function n(v: any, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function calcFinalPrice(costNet: number, vatRate: number, markupRate: number) {
  const withVat = costNet * (1 + vatRate / 100);
  const withMarkup = withVat * (1 + markupRate / 100);
  return Math.round(withMarkup * 100) / 100;
}

function payloadEqualsRow(p: DirtyPayload, r: Row) {
  const finalOk = p.use_final_price
    ? n(p.final_price, n(r.price, 0)) === n(r.price, 0)
    : true;

  return (
    n(p.cost_net, 0) === n(r.cost_net, 0) &&
    n(p.vat_rate, 21) === n(r.vat_rate, 21) &&
    n(p.markup_rate, 0) === n(r.markup_rate, 0) &&
    Math.max(1, n(p.units_per_case, 1)) === Math.max(1, n(r.units_per_case, 1)) &&
    finalOk
  );
}

export default function ProductsPage() {
  const pageSize = 200;

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [query, setQuery] = useState("");

  // rows = todo lo cargado (puede crecer por páginas)
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // paginación
  const [page, setPage] = useState<number>(0);
  const [dataLimit, setDataLimit] = useState<number>(pageSize);

  const [dirtyById, setDirtyById] = useState<Record<string, DirtyPayload>>({});
  const dirtyCount = Object.keys(dirtyById).length;

  // foco al primer input visible
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  const hasChanges = useMemo(() => dirtyCount > 0, [dirtyCount]);

  // ===== Resumen ↑ / ↓ basado en "precio final elegido" vs row.price =====
  const changesSummary = useMemo(() => {
    let up = 0;
    let down = 0;

    for (const [id, p] of Object.entries(dirtyById)) {
      const r = rows.find((x) => x.id === id);
      if (!r) continue;

      const current = n(r.price, 0);

      const calc = calcFinalPrice(n(p.cost_net, 0), n(p.vat_rate, 21), n(p.markup_rate, 0));
      const chosen = p.use_final_price ? n(p.final_price, calc) : calc;

      const diff = Math.round((chosen - current) * 100) / 100;
      if (diff > 0) up++;
      else if (diff < 0) down++;
    }

    return { up, down };
  }, [dirtyById, rows]);

  function confirmDiscardIfNeeded(actionLabel: string) {
    if (!hasChanges) return true;
    return window.confirm(
      `Tenés ${dirtyCount} producto(s) con cambios sin guardar.\n\nSi continuás, se van a limpiar.\n\n¿Querés continuar con: ${actionLabel}?`
    );
  }

  async function reload(opts?: { sid?: string; useLimit?: number; keepEdits?: boolean }) {
    const useId = opts?.sid ?? storeId;
    if (!useId) return;

    const keepEdits = opts?.keepEdits ?? false;
    const useLimit = opts?.useLimit ?? dataLimit;

    if (!keepEdits) {
      if (!confirmDiscardIfNeeded("Buscar/recargar")) return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("products_with_stock", {
        p_store: useId,
        p_query: query?.trim() ? query.trim() : null,
        p_limit: useLimit,
      });
      if (error) throw error;

      setRows((data ?? []) as Row[]);

      if (!keepEdits) setDirtyById({});

      setTimeout(() => firstInputRef.current?.focus(), 50);
    } catch (e: any) {
      alert(`Error cargando productos: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  async function runNormalSearch() {
    if (!storeId) return;
    // búsqueda normal: página 1, trae 200
    setPage(0);
    setDataLimit(pageSize);
    await reload({ sid: storeId, useLimit: pageSize, keepEdits: false });
  }

  async function goPrevPage() {
    setPage((p) => Math.max(0, p - 1));
    setTimeout(() => firstInputRef.current?.focus(), 50);
  }

  async function goNextPage() {
    const nextPage = page + 1;
    const neededLimit = (nextPage + 1) * pageSize;

    if (neededLimit > dataLimit) {
      setDataLimit(neededLimit);
      await reload({ sid: storeId, useLimit: neededLimit, keepEdits: true });
    }

    setPage(nextPage);
    setTimeout(() => firstInputRef.current?.focus(), 50);
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

  // cambio sucursal: página 1 y 200
  useEffect(() => {
    if (!storeId) return;
    setPage(0);
    setDataLimit(pageSize);
    reload({ sid: storeId, useLimit: pageSize, keepEdits: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // debounce búsqueda: vuelve a página 1 y 200
  useEffect(() => {
    if (!storeId) return;
    const t = setTimeout(() => {
      setPage(0);
      setDataLimit(pageSize);
      reload({ sid: storeId, useLimit: pageSize, keepEdits: false });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const saveAll = async () => {
    const ids = Object.keys(dirtyById);
    if (ids.length === 0) return;

    if (!window.confirm(`¿Guardar ${ids.length} productos?`)) return;

    setLoading(true);
    try {
      for (const productId of ids) {
        const payload = dirtyById[productId];

        const res = await fetch("/api/products/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            cost_net: payload.cost_net,
            vat_rate: payload.vat_rate,
            markup_rate: payload.markup_rate,
            units_per_case: payload.units_per_case,
            final_price: payload.use_final_price ? payload.final_price : null,
          }),
        });

        const json = await res.json().catch(() => ({}));
        if (!json?.ok) {
          alert(`Error guardando producto (${productId}): ${json?.error ?? "desconocido"}`);
          return;
        }
      }

      setDirtyById({});
      await reload({ sid: storeId, useLimit: dataLimit, keepEdits: true });
      alert("Cambios guardados ✅");
    } finally {
      setLoading(false);
    }
  };

  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="text-2xl font-semibold mb-4">Precios</h1>

      <div className="flex gap-3 mb-4 items-end flex-wrap">
        <select
          className="border rounded px-3 py-2"
          value={storeId}
          onChange={(e) => {
            setDirtyById({});
            setStoreId(e.target.value);
          }}
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <input
          className="border rounded px-3 py-2 w-72"
          placeholder="Buscar nombre o SKU"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <button
          className="bg-black text-white rounded px-4 py-2 disabled:opacity-50"
          onClick={runNormalSearch}
          disabled={loading || !storeId}
        >
          {loading ? "Cargando..." : "Buscar"}
        </button>

        {/* PAGINACIÓN */}
        <div className="flex items-center gap-2">
          <button
            className="bg-gray-200 rounded px-3 py-2 disabled:opacity-50"
            onClick={goPrevPage}
            disabled={page === 0}
            title="Página anterior"
          >
            ◀
          </button>

          <span className="text-sm text-gray-700">
            Página <b>{page + 1}</b>
          </span>

          <button
            className="bg-gray-200 rounded px-3 py-2 disabled:opacity-50"
            onClick={goNextPage}
            disabled={loading || !storeId}
            title="Página siguiente"
          >
            ▶
          </button>
        </div>

        <button
          className="bg-emerald-700 text-white rounded px-4 py-2 disabled:opacity-50"
          onClick={saveAll}
          disabled={dirtyCount === 0 || loading}
        >
          {dirtyCount === 0 ? "Sin cambios" : `Guardar cambios (${dirtyCount})`}
        </button>

        {/* RESUMEN CAMBIOS */}
        <span className="text-sm text-gray-700">
          Cambios: <b>{dirtyCount}</b>{" "}
          {dirtyCount > 0 && (
            <>
              | <span className="text-emerald-700">↑ {changesSummary.up}</span>{" "}
              | <span className="text-red-600">↓ {changesSummary.down}</span>
            </>
          )}
        </span>

        <span className="text-sm text-gray-600">
          Mostrando {rows.length === 0 ? 0 : page * pageSize + 1}–{Math.min((page + 1) * pageSize, rows.length)} de{" "}
          {rows.length} cargados
        </span>
      </div>

      <div className="border rounded bg-white overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2">SKU</th>
              <th className="p-2 text-right">Costo</th>
              <th className="p-2 text-right">IVA %</th>
              <th className="p-2 text-right">Margen %</th>
              <th className="p-2 text-right">
                Precio final
                <div className="text-xs text-gray-500">(editable)</div>
              </th>
            </tr>
          </thead>

          <tbody>
            {pageRows.map((r, idx) => (
              <RowLine
                key={r.id}
                row={r}
                isDirty={!!dirtyById[r.id]}
                firstRow={idx === 0}
                firstInputRef={firstInputRef}
                onDirtyChange={(payload) => {
                  if (payloadEqualsRow(payload, r)) {
                    setDirtyById((p) => {
                      const c = { ...p };
                      delete c[r.id];
                      return c;
                    });
                  } else {
                    setDirtyById((p) => ({ ...p, [r.id]: payload }));
                  }
                }}
              />
            ))}

            {pageRows.length === 0 && (
              <tr>
                <td className="p-4 text-gray-600" colSpan={6}>
                  No hay resultados para esta búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function focusNextInput(from: HTMLInputElement) {
  // solo inputs de la tabla de precios (evita saltar a search/store)
  const table = from.closest("table");
  if (!table) return;

  const inputs = Array.from(table.querySelectorAll<HTMLInputElement>('input[data-price-input="1"]'));
  const idx = inputs.indexOf(from);
  if (idx >= 0 && inputs[idx + 1]) inputs[idx + 1].focus();
}

function RowLine({
  row,
  isDirty,
  onDirtyChange,
  firstRow,
  firstInputRef,
}: {
  row: Row;
  isDirty: boolean;
  onDirtyChange: (payload: DirtyPayload) => void;
  firstRow: boolean;
  firstInputRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  const [cost, setCost] = useState(n(row.cost_net, 0));
  const [vat, setVat] = useState(n(row.vat_rate, 21));
  const [margin, setMargin] = useState(n(row.markup_rate, 0));

  // fijo: no se edita acá
  const unitsCaseFixed = Math.max(1, n(row.units_per_case, 1));

  const [useFinalPrice, setUseFinalPrice] = useState(false);
  const [finalManual, setFinalManual] = useState(n(row.price, 0));

  useEffect(() => {
    onDirtyChange({
      cost_net: cost,
      vat_rate: vat,
      markup_rate: margin,
      units_per_case: unitsCaseFixed,
      use_final_price: useFinalPrice,
      final_price: useFinalPrice ? finalManual : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cost, vat, margin, useFinalPrice, finalManual, unitsCaseFixed]);

  const calcPrice = calcFinalPrice(cost, vat, margin);
  const shownPrice = useFinalPrice ? finalManual : calcPrice;

  return (
    <tr className={isDirty ? "bg-amber-50" : ""}>
      <td className="p-2">{row.name}</td>
      <td className="p-2">{row.sku ?? "-"}</td>

      <td className="p-2 text-right">
        <input
          data-price-input="1"
          className="border rounded px-2 py-1 w-24 text-right"
          value={cost}
          onChange={(e) => setCost(n(e.target.value, 0))}
          ref={firstRow ? firstInputRef : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              focusNextInput(e.currentTarget);
            }
          }}
        />
      </td>

      <td className="p-2 text-right">
        <input
          data-price-input="1"
          className="border rounded px-2 py-1 w-16 text-right"
          value={vat}
          onChange={(e) => setVat(n(e.target.value, 21))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              focusNextInput(e.currentTarget);
            }
          }}
        />
      </td>

      <td className="p-2 text-right">
        <input
          data-price-input="1"
          className="border rounded px-2 py-1 w-16 text-right"
          value={margin}
          onChange={(e) => setMargin(n(e.target.value, 0))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              focusNextInput(e.currentTarget);
            }
          }}
        />
      </td>

      <td className="p-2 text-right">
        <input
          data-price-input="1"
          className="border rounded px-2 py-1 w-24 text-right font-semibold"
          value={shownPrice}
          onChange={(e) => {
            setFinalManual(n(e.target.value, 0));
            setUseFinalPrice(true);
          }}
          title="Al editar acá, pasa a precio manual"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              focusNextInput(e.currentTarget);
            }
          }}
        />
      </td>
    </tr>
  );
}
