"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

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

  // ✅ para ocultar desactivados
  active?: boolean | null;
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

function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function priceFlags(row: Row) {
  const cost = n(row.cost_net, 0);
  const margin = n(row.markup_rate, 0);
  const price = n(row.price, 0);
  const suggested = calcFinalPrice(cost, n(row.vat_rate, 21), margin);
  const manual = Math.abs(price - suggested) > 0.009;

  return {
    suggested,
    manual,
    noCost: cost <= 0,
    noMargin: margin <= 0,
    belowCost: cost > 0 && price > 0 && price < cost,
  };
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
  const [viewFilter, setViewFilter] = useState("all");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState<number>(0);
  const [dataLimit, setDataLimit] = useState<number>(pageSize);

  const [dirtyById, setDirtyById] = useState<Record<string, DirtyPayload>>({});
  const dirtyCount = Object.keys(dirtyById).length;

  const firstInputRef = useRef<HTMLInputElement | null>(null);

  const hasChanges = useMemo(() => dirtyCount > 0, [dirtyCount]);

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
      const res = await fetch("/api/products/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: useId,
          query: query?.trim() ? query.trim() : null,
          limit: useLimit,
        }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();

      // ✅ Ocultar desactivados (active=false). Si no viene active => se muestra (modo seguro).
      const list = ((data ?? []) as any[]).filter((x) => x?.active !== false) as Row[];

      setRows(list);

      setPage((p) => {
        const maxPage = Math.max(0, Math.ceil(list.length / pageSize) - 1);
        return Math.min(p, maxPage);
      });

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
    fetch("/api/stores")
      .then((r) => r.json())
      .then((j) => {
        const list = (j.stores ?? []) as Store[];
        setStores(list);
        if (!storeId && list[0]?.id) setStoreId(list[0].id);
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!storeId) return;
    setPage(0);
    setDataLimit(pageSize);
    reload({ sid: storeId, useLimit: pageSize, keepEdits: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

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
            use_final_price: payload.use_final_price === true,
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

  const stats = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const flags = priceFlags(row);
        if (flags.manual) acc.manual++;
        if (flags.noCost) acc.noCost++;
        if (flags.noMargin) acc.noMargin++;
        if (flags.belowCost) acc.belowCost++;
        return acc;
      },
      { total: rows.length, manual: 0, noCost: 0, noMargin: 0, belowCost: 0 }
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (viewFilter === "all") return rows;
    if (viewFilter === "changed") return rows.filter((row) => dirtyById[row.id]);
    return rows.filter((row) => {
      const flags = priceFlags(row);
      if (viewFilter === "manual") return flags.manual;
      if (viewFilter === "no_cost") return flags.noCost;
      if (viewFilter === "no_margin") return flags.noMargin;
      if (viewFilter === "below_cost") return flags.belowCost;
      if (viewFilter === "review") return flags.noCost || flags.noMargin || flags.belowCost;
      return true;
    });
  }, [dirtyById, rows, viewFilter]);

  useEffect(() => {
    setPage(0);
  }, [viewFilter]);

  const maxPage = Math.max(0, Math.ceil(filteredRows.length / pageSize) - 1);
  const safePage = Math.min(page, maxPage);
  const pageRows = filteredRows.slice(safePage * pageSize, (safePage + 1) * pageSize);

  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="text-2xl font-semibold mb-4">Precios</h1>

      <p className="mb-4 max-w-3xl text-sm text-neutral-600">
        Editá precios base por sucursal. El precio sugerido es solo una referencia calculada con costo, IVA y margen;
        el POS sigue cobrando el precio final.
      </p>

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
            Página <b>{safePage + 1}</b>
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
          {dirtyCount === 0 ? "Guardar cambios" : `Guardar ${dirtyCount} cambio${dirtyCount === 1 ? "" : "s"}`}
        </button>

        <span className="text-sm text-gray-700">
          {dirtyCount === 0 ? "0 cambios pendientes" : <><b>{dirtyCount}</b> cambios pendientes</>}{" "}
          {dirtyCount > 0 && (
            <>
              | <span className="text-emerald-700">↑ {changesSummary.up}</span>{" "}
              | <span className="text-red-600">↓ {changesSummary.down}</span>
            </>
          )}
        </span>

        <span className="text-sm text-gray-600">
          Mostrando {filteredRows.length === 0 ? 0 : safePage * pageSize + 1}–
          {Math.min((safePage + 1) * pageSize, filteredRows.length)} de {filteredRows.length} visibles
        </span>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-5">
        <div className="rounded-2xl border bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Productos</div>
          <div className="text-2xl font-semibold">{stats.total}</div>
        </div>
        <div className="rounded-2xl border bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Manuales</div>
          <div className="text-2xl font-semibold">{stats.manual}</div>
        </div>
        <div className="rounded-2xl border bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Sin costo</div>
          <div className="text-2xl font-semibold">{stats.noCost}</div>
        </div>
        <div className="rounded-2xl border bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Sin margen</div>
          <div className="text-2xl font-semibold">{stats.noMargin}</div>
        </div>
        <div className="rounded-2xl border bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Bajo costo</div>
          <div className="text-2xl font-semibold text-red-600">{stats.belowCost}</div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["all", "Todos"],
          ["changed", "Con cambios"],
          ["manual", "Manuales"],
          ["no_cost", "Sin costo"],
          ["no_margin", "Sin margen"],
          ["below_cost", "Bajo costo"],
          ["review", "Revisar"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setViewFilter(value)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium ${
              viewFilter === value ? "bg-black text-white" : "bg-white hover:bg-neutral-50"
            }`}
          >
            {label}
          </button>
        ))}
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
                Precio sugerido
                <div className="text-xs text-gray-500">(costo + IVA + margen)</div>
              </th>
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
                <td className="p-4 text-gray-600" colSpan={7}>
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

  // ✅ modo manual/auto persistente al recargar
  const [useFinalPrice, setUseFinalPrice] = useState(false);
  const [finalManual, setFinalManual] = useState(n(row.price, 0));

  // ✅ sincronizar state cuando cambian los datos del row (recargar / cambiar sucursal / buscar)
  useEffect(() => {
    const nextCost = n(row.cost_net, 0);
    const nextVat = n(row.vat_rate, 21);
    const nextMargin = n(row.markup_rate, 0);
    const nextPrice = n(row.price, 0);

    setCost(nextCost);
    setVat(nextVat);
    setMargin(nextMargin);
    setFinalManual(nextPrice);

    const calc = calcFinalPrice(nextCost, nextVat, nextMargin);

    // Si el price guardado difiere del calculado => es MANUAL
    const isManual = Math.abs(nextPrice - calc) > 0.009;
    setUseFinalPrice(isManual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id, row.cost_net, row.vat_rate, row.markup_rate, row.price]);

  const calcPrice = calcFinalPrice(cost, vat, margin);
  const shownPrice = useFinalPrice ? finalManual : calcPrice;
  const belowCost = cost > 0 && shownPrice > 0 && shownPrice < cost;
  const noCost = cost <= 0;
  const noMargin = margin <= 0;

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

  return (
    <tr className={`${isDirty ? "bg-amber-50" : ""} ${belowCost ? "bg-red-50" : ""}`}>
      <td className="p-2">
        <div className="font-medium">{row.name}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {useFinalPrice && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
              Manual
            </span>
          )}
          {!useFinalPrice && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              Calculado
            </span>
          )}
          {noCost && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              Sin costo
            </span>
          )}
          {noMargin && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
              Sin margen
            </span>
          )}
          {belowCost && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
              Bajo costo
            </span>
          )}
          {isDirty && (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700">
              Sin guardar
            </span>
          )}
        </div>
      </td>
      <td className="p-2 text-neutral-600">{row.sku ?? "-"}</td>

      <td className="p-2 text-right">
        <input
          data-price-input="1"
          className="border rounded px-2 py-1 w-24 text-right"
          value={cost}
          onChange={(e) => {
            setCost(n(e.target.value, 0));
            setUseFinalPrice(false);
          }}
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
          onChange={(e) => {
            setVat(n(e.target.value, 21));
            setUseFinalPrice(false);
          }}
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
          onChange={(e) => {
            setMargin(n(e.target.value, 0));
            setUseFinalPrice(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              focusNextInput(e.currentTarget);
            }
          }}
        />
      </td>

      <td className="p-2 text-right">
        <div className="font-semibold">{formatMoney(calcPrice)}</div>
        <div className="text-[11px] text-neutral-500">
          {noCost || noMargin ? "Faltan datos" : "Referencia"}
        </div>
      </td>

      <td className="p-2 text-right">
        <input
          data-price-input="1"
          className={`border rounded px-2 py-1 w-24 text-right font-semibold ${
            belowCost ? "border-red-400 bg-red-50 text-red-700" : ""
          }`}
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
        <div className={`text-[11px] mt-1 ${belowCost ? "text-red-600 font-medium" : "text-neutral-500"}`}>
          {belowCost ? "Revisar" : useFinalPrice ? "Manual" : "Auto"}
        </div>
      </td>
    </tr>
  );
}
