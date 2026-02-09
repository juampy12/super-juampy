"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Store = { id: string; name: string };
type Row = {
  id: string;
  sku: string | null;
  name: string;
  stock: number | null;
  is_weighted?: boolean | null;
};

export default function StockPage() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");

  // búsqueda normal
  const [query, setQuery] = useState<string>("");

  // modo escáner (SKU)
  const [scan, setScan] = useState<string>("");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // paginación
  const pageSize = 200;
  const [page, setPage] = useState<number>(0);

  // “dataLimit” = cuántas filas traemos al backend (crece al avanzar páginas)
  const [dataLimit, setDataLimit] = useState<number>(pageSize);

  // cambios: product_id -> stock nuevo (string para permitir vacío)
  const [newStockById, setNewStockById] = useState<Record<string, string>>({});

  // ref para enfocar el primer input de la página actual
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  function confirmDiscardIfNeeded(actionLabel: string) {
    if (!hasAnyTypedChanges) return true;
    return window.confirm(
      `Tenés cambios de stock sin guardar.\n\nSi continuás, se van a limpiar.\n\n¿Querés continuar con: ${actionLabel}?`
    );
  }

  async function supaFetch(path: string, init?: RequestInit) {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      ...init,
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText} - ${txt}`);
    }
    return res;
  }

  async function loadStores() {
    const res = await supaFetch(`/rest/v1/stores?select=id,name&order=name.asc`);
    const data = (await res.json()) as Store[];
    setStores(data);
    if (!storeId && data.length) setStoreId(data[0].id);
  }

  /**
   * search:
   * - default: reemplaza rows y limpia cambios (seguro)
   * - keepEdits=true: NO pide confirmación y NO limpia cambios (para paginar sin perder lo tipeado)
   */
  async function search(opts?: {
    forceQuery?: string | null;
    useLimit?: number;
    keepEdits?: boolean;
  }) {
    if (!storeId) return;

    const keepEdits = opts?.keepEdits ?? false;
    const useLimit = opts?.useLimit ?? dataLimit;
    const forceQuery = opts?.forceQuery ?? undefined;

    if (!keepEdits) {
      if (!confirmDiscardIfNeeded("Buscar/recargar")) return;
    }

    setLoading(true);
    try {
      const q =
        forceQuery !== undefined
          ? forceQuery
          : query?.trim()
          ? query.trim()
          : null;

      const body = { p_store: storeId, p_query: q, p_limit: useLimit };

      const res = await supaFetch(`/rest/v1/rpc/products_with_stock`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as any[];
      const mapped: Row[] = data.map((x) => ({
        id: x.id,
        sku: x.sku ?? null,
        name: x.name,
        stock: typeof x.stock === "number" ? x.stock : Number(x.stock ?? 0),
        is_weighted: x.is_weighted ?? null,
      }));

      setRows(mapped);

      if (!keepEdits) setNewStockById({});

      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 50);
    } catch (e: any) {
      alert(`Error buscando productos: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
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
      await search({ useLimit: neededLimit, keepEdits: true });
    }

    setPage(nextPage);
    setTimeout(() => firstInputRef.current?.focus(), 50);
  }

  async function scanSearch() {
    if (!storeId) return;
    const sku = scan.trim();
    if (!sku) return;

    // escaneo: siempre página 1, resultados chicos y rápidos
    setPage(0);
    setDataLimit(20);
    await search({ forceQuery: sku, useLimit: 20 });

    setScan("");
  }

  async function runNormalSearch() {
    // buscar normal: página 1 y 200 resultados
    setPage(0);
    setDataLimit(pageSize);
    await search({ useLimit: pageSize });
  }

  function setRowNewStock(productId: string, value: string) {
    setNewStockById((prev) => ({ ...prev, [productId]: value }));
  }

  function clearRowNewStock(productId: string) {
    setNewStockById((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }

  function copyRowCurrentToNew(r: Row) {
    const current = Number(r.stock ?? 0);
    setRowNewStock(r.id, String(current));
  }

  function copyVisiblePageToNew() {
    // Copia SOLO los visibles (página actual). No pisa si ya hay valor tipeado.
    setNewStockById((prev) => {
      const next = { ...prev };
      for (const r of pageRows) {
        const existing = next[r.id];
        if (existing !== undefined && existing !== "") continue; // no pisar lo que ya tipeaste
        next[r.id] = String(Number(r.stock ?? 0));
      }
      return next;
    });
  }

  const pageRows = useMemo(() => {
    return rows.slice(page * pageSize, (page + 1) * pageSize);
  }, [rows, page]);

  const changes = useMemo(() => {
    // Solo cambios reales (nuevo != actual)
    const list: Array<{ id: string; current: number; next: number; delta: number }> = [];
    for (const r of rows) {
      const v = newStockById[r.id];
      if (v === undefined || v === "") continue;
      const parsed = Number(v);
      if (!Number.isFinite(parsed)) continue;
      const current = Number(r.stock ?? 0);
      if (parsed === current) continue;
      list.push({ id: r.id, current, next: parsed, delta: parsed - current });
    }
    return list;
  }, [rows, newStockById]);

  const hasAnyTypedChanges = useMemo(() => {
    // “hay algo escrito” aunque sea igual (para advertir si se limpia)
    return rows.some((r) => {
      const v = newStockById[r.id];
      return v !== undefined && v !== "";
    });
  }, [rows, newStockById]);

  const summary = useMemo(() => {
    let up = 0;
    let down = 0;
    let big = 0;

    for (const c of changes) {
      if (c.delta > 0) up++;
      if (c.delta < 0) down++;

      const abs = Math.abs(c.delta);
      // "cambio grande": más de 50 unidades o más del 50% del stock actual (si actual > 0)
      const bigByAbs = abs >= 50;
      const bigByPct = c.current > 0 ? abs / c.current >= 0.5 : abs >= 50;
      if (bigByAbs || bigByPct) big++;
    }

    return {
      changed: changes.length,
      up,
      down,
      big,
    };
  }, [changes]);

  async function saveChanges() {
    if (changes.length === 0) return;

    // advertencia si hay cambios grandes
    if (summary.big > 0) {
      const ok = window.confirm(
        `⚠️ Hay ${summary.big} cambio(s) grande(s) de stock.\n\n` +
          `Esto puede ser correcto (conteo real) o un error de tipeo.\n\n` +
          `¿Querés continuar y guardar igual?`
      );
      if (!ok) return;
    }

    if (!window.confirm(`¿Guardar stock de ${changes.length} productos?`)) return;

    setSaving(true);
    try {
      for (const item of changes) {
        const res = await fetch(`/api/stock/adjust`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_id: storeId,
            product_id: item.id,
            new_stock: item.next,
            stock: item.next,
            quantity: item.next,
            reason: "inventory_count",
            note: "Conteo desde /stock",
          }),
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(
            `Fallo guardando ${item.id}: ${res.status} ${res.statusText} - ${txt}`
          );
        }
      }

      // refrescar (misma query, mismo dataLimit) sin limpiar los inputs
      await search({ useLimit: dataLimit, keepEdits: true });
      alert("Stock actualizado ✅");
    } catch (e: any) {
      alert(`Error guardando stock: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (storeId) {
      setPage(0);
      setDataLimit(pageSize);
      search({ forceQuery: null, useLimit: pageSize });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  function deltaClass(delta: number) {
    if (delta > 0) return "text-emerald-700";
    if (delta < 0) return "text-red-700";
    return "text-gray-500";
  }

  function rowBgClass(delta: number, changed: boolean, big: boolean) {
    if (!changed) return "";
    if (big) return "bg-red-50"; // cambio grande: destacarlo fuerte (para revisar)
    // cambio normal
    return delta >= 0 ? "bg-emerald-50" : "bg-red-50";
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Inventario — Stock</h1>

      <div className="flex flex-wrap gap-3 items-center mb-2">
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

        {/* ESCANEAR SKU */}
        <input
          className="border rounded px-3 py-2 min-w-[260px] font-mono"
          placeholder="Escanear SKU y Enter"
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") scanSearch();
          }}
        />

        {/* BUSCAR NORMAL */}
        <input
          className="border rounded px-3 py-2 min-w-[320px]"
          placeholder="Buscar nombre o SKU"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runNormalSearch();
          }}
        />

        <button
          className="bg-black text-white rounded px-4 py-2 disabled:opacity-50"
          onClick={runNormalSearch}
          disabled={loading || !storeId}
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center mb-3">
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
          className="bg-gray-100 hover:bg-gray-200 rounded px-4 py-2 disabled:opacity-50"
          onClick={copyVisiblePageToNew}
          disabled={pageRows.length === 0}
          title="Copiar stock actual → stock nuevo (solo visibles, no pisa lo ya tipeado)"
        >
          Copiar visible
        </button>

        <button
          className="bg-emerald-600 text-white rounded px-4 py-2 disabled:opacity-50"
          onClick={saveChanges}
          disabled={changes.length === 0 || saving}
          title={changes.length === 0 ? "No hay cambios" : "Guardar cambios de stock"}
        >
          {saving ? "Guardando..." : "Guardar stock"}
        </button>

        {/* RESUMEN */}
        <div className="text-sm text-gray-700">
          Cambios: <b>{summary.changed}</b>{" "}
          <span className="ml-2 text-emerald-700">⬆ {summary.up}</span>{" "}
          <span className="ml-2 text-red-700">⬇ {summary.down}</span>{" "}
          {summary.big > 0 && (
            <span className="ml-2 text-red-700">⚠ grandes: {summary.big}</span>
          )}
        </div>
      </div>

      <div className="text-sm text-gray-600 mb-4">
        Stock actual = solo lectura • Stock nuevo = conteo (lo que hay) • Tip: escaneá SKU para cargar rápido y enfocar el conteo.
      </div>

      <div className="border rounded overflow-auto">
        <table className="min-w-[1000px] w-full">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="text-left p-2">Nombre</th>
              <th className="text-left p-2">SKU</th>
              <th className="text-right p-2">Stock actual</th>
              <th className="text-right p-2">
                <div className="leading-tight">
                  <div>Stock nuevo</div>
                  <div className="text-xs text-gray-500">(conteo)</div>
                </div>
              </th>
              <th className="text-right p-2">Δ</th>
              <th className="text-left p-2">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {pageRows.map((r, i) => {
              const current = Number(r.stock ?? 0);
              const v = newStockById[r.id] ?? "";
              const parsed = v === "" ? null : Number(v);

              const changed =
                parsed !== null && Number.isFinite(parsed) && parsed !== current;

              const delta = changed ? (parsed as number) - current : 0;

              const abs = Math.abs(delta);
              const bigByAbs = abs >= 50;
              const bigByPct = current > 0 ? abs / current >= 0.5 : abs >= 50;
              const big = changed && (bigByAbs || bigByPct);

              return (
                <tr
                  key={r.id}
                  className={[
                    i % 2 === 0 ? "bg-white" : "bg-gray-50",
                    "hover:bg-yellow-50",
                    rowBgClass(delta, changed, big),
                  ].join(" ")}
                >
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 font-mono text-sm">{r.sku ?? "-"}</td>

                  <td className="p-2 text-right whitespace-nowrap">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-sm font-medium text-gray-900">
                      {current} u
                    </span>
                  </td>

                  <td className="p-2 text-right">
                    <input
                      type="number"
                      className={
                        "border rounded px-2 py-1 w-28 text-right outline-none " +
                        (changed ? (big ? "border-red-600" : "border-emerald-600") : "")
                      }
                      ref={i === 0 ? firstInputRef : undefined}
                      value={v}
                      onChange={(e) => setRowNewStock(r.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          // Enter → siguiente input (solo los visibles)
                          const inputs = Array.from(
                            document.querySelectorAll<HTMLInputElement>('input[type="number"]')
                          );
                          const idx = inputs.indexOf(e.currentTarget);
                          if (idx >= 0 && inputs[idx + 1]) inputs[idx + 1].focus();
                        }
                      }}
                    />
                  </td>

                  <td className={"p-2 text-right font-mono " + deltaClass(delta)}>
                    {changed ? (
                      <span title={big ? "Cambio grande: revisá antes de guardar" : ""}>
                        {delta > 0 ? `+${delta}` : `${delta}`}{" "}
                        {big ? "⚠" : ""}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>

                  <td className="p-2">
                    <div className="flex gap-2">
                      <button
                        className="border rounded px-3 py-1 hover:bg-gray-100"
                        type="button"
                        onClick={() => copyRowCurrentToNew(r)}
                        title="Copiar stock actual → stock nuevo"
                      >
                        Copiar
                      </button>

                      <button
                        className="border rounded px-3 py-1 hover:bg-gray-100"
                        type="button"
                        onClick={() => setRowNewStock(r.id, "0")}
                        title="Marcar 0 (faltante)"
                      >
                        0
                      </button>

                      <button
                        className="border rounded px-3 py-1 hover:bg-gray-100"
                        type="button"
                        onClick={() => clearRowNewStock(r.id)}
                        title="Limpiar stock nuevo"
                      >
                        Limpiar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td className="p-4 text-gray-600" colSpan={6}>
                  No hay resultados. Elegí sucursal y buscá por nombre o SKU.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        Mostrando {rows.length === 0 ? 0 : page * pageSize + 1}–{Math.min((page + 1) * pageSize, rows.length)} de {rows.length} cargados.
      </div>
    </div>
  );
}
