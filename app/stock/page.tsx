"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Store = { id: string; name: string };

type Row = {
  id: string;
  sku: string | null;
  name: string;
  stock: number | null;
  is_weighted?: boolean | null;
  active?: boolean | null;
};

export default function StockPage() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");

  // único buscador (sirve para nombre o SKU)
  const [query, setQuery] = useState<string>("");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // paginación
  const pageSize = 200;
  const [page, setPage] = useState<number>(0);

  // cuántas filas “pedimos” al backend (crece al avanzar páginas)
  const [dataLimit, setDataLimit] = useState<number>(pageSize);

  // si hay más resultados en el backend
  const [hasMore, setHasMore] = useState<boolean>(false);

  // cambios: product_id -> stock nuevo (string para permitir vacío)
  const [newStockById, setNewStockById] = useState<Record<string, string>>({});

  // ref para enfocar el primer input de la página actual
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  // ✅ evita que respuestas viejas pisen las nuevas (race condition)
  const searchSeq = useRef(0);

  const hasAnyTypedChanges = useMemo(() => {
    return Object.values(newStockById).some((v) => v !== undefined && v !== "");
  }, [newStockById]);

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
   *
   * Importante paginación:
   * - pedimos p_limit = useLimit + 1 para saber si hay más (hasMore)
   */
  async function search(opts?: {
    forceQuery?: string | null;
    useLimit?: number;
    keepEdits?: boolean;
  }): Promise<{ count: number; hasMore: boolean }> {
    if (!storeId) return { count: 0, hasMore: false };

    const keepEdits = opts?.keepEdits ?? false;
    const useLimit = opts?.useLimit ?? dataLimit;
    const forceQuery = opts?.forceQuery ?? undefined;

    if (!keepEdits) {
      if (!confirmDiscardIfNeeded("Buscar/recargar")) return { count: rows.length, hasMore };
    }

    // ✅ cada búsqueda tiene un id; si llega una respuesta vieja, se ignora
    const mySeq = ++searchSeq.current;

    setLoading(true);
    try {
      const q =
        forceQuery !== undefined ? forceQuery : query?.trim() ? query.trim() : null;

      // pedimos 1 más para detectar si hay más páginas
      const askLimit = useLimit + 1;

      const body = { p_store: storeId, p_query: q, p_limit: askLimit };
      console.log("[INV] RPC body", body);

      const res = await supaFetch(`/rest/v1/rpc/products_with_stock`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as any[];
      console.log("[INV] RPC rows sample", data?.slice?.(0, 3));

      // ✅ si esta respuesta no es la última, ignorar (evita pisadas)
      if (mySeq !== searchSeq.current) return { count: rows.length, hasMore };

      const mappedAll: Row[] = data.map((x) => ({
        id: x.id,
        sku: x.sku ?? null,
        name: x.name,
        stock: typeof x.stock === "number" ? x.stock : Number(x.stock ?? 0),
        is_weighted: x.is_weighted ?? null,
        active: typeof x.active === "boolean" ? x.active : x.active ?? null,
      }));

      // ocultar desactivados
      const filtered = mappedAll.filter((r) => r.active !== false);

      // hasMore: si (después de filtrar) sobran filas respecto a useLimit
      const nextHasMore = filtered.length > useLimit;

      // guardamos solo hasta useLimit
      const finalRows = filtered.slice(0, useLimit);

      setHasMore(nextHasMore);
      setRows(finalRows);

      if (!keepEdits) setNewStockById({});

      setTimeout(() => {
        if (mySeq !== searchSeq.current) return;
        firstInputRef.current?.focus();
      }, 50);

      return { count: finalRows.length, hasMore: nextHasMore };
    } catch (e: any) {
      if (mySeq === searchSeq.current) {
        alert(`Error buscando productos: ${e?.message ?? e}`);
      }
      return { count: rows.length, hasMore };
    } finally {
      if (mySeq === searchSeq.current) setLoading(false);
    }
  }

  async function goPrevPage() {
    setPage((p) => Math.max(0, p - 1));
    setTimeout(() => firstInputRef.current?.focus(), 50);
  }

  async function goNextPage() {
    const nextPage = page + 1;
    const neededLimit = (nextPage + 1) * pageSize;

    // si ya sabemos que no hay más y la próxima página quedaría vacía, no avanzar
    if (!hasMore && nextPage * pageSize >= rows.length) return;

    // si necesitamos pedir más al backend, subimos dataLimit y recargamos sin perder lo tipeado
    if (neededLimit > dataLimit) {
      setDataLimit(neededLimit);
      const result = await search({ useLimit: neededLimit, keepEdits: true });

      // si igual no hay suficientes para mostrar la próxima página, no avanzar
      if (nextPage * pageSize >= result.count) return;
    } else {
      // aunque no aumente el límite, si la próxima página no existe, no avanzar
      if (nextPage * pageSize >= rows.length) return;
    }

    setPage(nextPage);
    setTimeout(() => firstInputRef.current?.focus(), 50);
  }

  async function runSearchSmart() {
    // un solo buscador:
    // - si parece SKU (solo números y largo razonable), buscamos rápido
    // - si no, búsqueda normal
    const t = query.trim();
    const looksLikeSku = /^\d{6,}$/.test(t);

    setPage(0);
    if (looksLikeSku) {
      setDataLimit(20);
      await search({ forceQuery: t, useLimit: 20 });
    } else {
      setDataLimit(pageSize);
      await search({ useLimit: pageSize });
    }
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

  const pageRows = useMemo(() => {
    return rows.slice(page * pageSize, (page + 1) * pageSize);
  }, [rows, page]);

  function copyVisiblePageToNew() {
    setNewStockById((prev) => {
      const next = { ...prev };
      for (const r of pageRows) {
        const existing = next[r.id];
        if (existing !== undefined && existing !== "") continue;
        next[r.id] = String(Number(r.stock ?? 0));
      }
      return next;
    });
  }

  const changes = useMemo(() => {
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

  const changesCount = changes.length;

  const changesSummary = useMemo(() => {
    let up = 0;
    let down = 0;
    for (const c of changes) {
      if (c.delta > 0) up += 1;
      if (c.delta < 0) down += 1;
    }
    return { up, down };
  }, [changes]);

  async function saveAll() {
    if (!storeId) return;
    if (changesCount === 0) {
      alert("No hay cambios para guardar.");
      return;
    }

    const ok = window.confirm(
      `Vas a guardar ${changesCount} cambio(s) de stock.\n\n↑ ${changesSummary.up}  ↓ ${changesSummary.down}\n\n¿Confirmás?`
    );
    if (!ok) return;

    setSaving(true);
    try {
      // ✅ BATCH: 1 request (más confiable + más rápido)
      const res = await fetch(`/api/stock/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          reason: "Ajuste manual (Inventario)",
          changes: changes.map((c) => ({ product_id: c.id, stock: c.next })),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `${res.status} ${res.statusText}`);
      }

      // ✅ UI inmediata: reflejar lo guardado sin esperar refetch
      const nextById = new Map(changes.map((c) => [c.id, c.next]));
      setRows((prev) =>
        prev.map((r) => (nextById.has(r.id) ? { ...r, stock: nextById.get(r.id)! } : r))
      );

      // limpiamos inputs “Stock nuevo”
      setNewStockById({});

      // y además refrescamos desde backend para quedar 100% sync
      setPage(0);
      setDataLimit(pageSize);
      await search({ useLimit: pageSize });

      alert("Stock guardado correctamente ✅");
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
    if (!storeId) return;
    setPage(0);
    setDataLimit(pageSize);
    search({ useLimit: pageSize });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const canGoNext = useMemo(() => {
    if (loading || saving) return false;
    if (hasMore) return true;
    return (page + 1) * pageSize < rows.length;
  }, [loading, saving, hasMore, page, rows.length]);

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Inventario</h1>
          <p className="text-sm text-gray-600">
            Nota: en Inventario se muestran <b>solo productos activos</b> (desactivados quedan ocultos).
          </p>
        </div>

        <div className="flex gap-2 items-center">
          <button
            className="px-3 py-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
            onClick={() => search({ useLimit: dataLimit })}
            disabled={loading || saving}
          >
            Recargar
          </button>

          <button
            className="px-3 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50"
            onClick={saveAll}
            disabled={saving || loading || changesCount === 0}
          >
            {saving ? "Guardando..." : `Guardar (${changesCount})`}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 rounded-xl border bg-white space-y-2">
          <div className="text-sm font-medium">Sucursal</div>
          <select
            className="w-full border rounded-lg px-3 py-2"
            value={storeId}
            onChange={(e) => {
              if (!confirmDiscardIfNeeded("Cambiar sucursal")) return;
              setNewStockById({});
              setStoreId(e.target.value);
            }}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="p-3 rounded-xl border bg-white space-y-2">
          <div className="text-sm font-medium">Buscar (nombre / SKU)</div>
          <div className="flex gap-2">
            <input
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Ej: coca / 779..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearchSmart();
              }}
            />
            <button
              className="px-3 py-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
              onClick={runSearchSmart}
              disabled={loading || saving}
            >
              Buscar
            </button>
          </div>
          <div className="text-xs text-gray-500">
            Tip: si escaneás un código (solo números), busca rápido.
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="text-sm text-gray-600">
          {loading ? (
            "Cargando..."
          ) : (
            <>
              Productos: <b>{rows.length.toLocaleString("es-AR")}</b> (activos)
              {hasMore ? <span>+</span> : null}
            </>
          )}
          {changesCount > 0 && (
            <span className="ml-2">
              • Cambios: <b>{changesCount}</b> (↑ {changesSummary.up} / ↓ {changesSummary.down})
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <button
            className="px-3 py-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
            onClick={copyVisiblePageToNew}
            disabled={loading || saving || pageRows.length === 0}
          >
            Copiar visibles (actual → nuevo)
          </button>
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden bg-white">
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">Producto</th>
                <th className="p-2 text-left">SKU</th>
                <th className="p-2 text-right">Stock actual</th>
                <th className="p-2 text-right">Stock nuevo</th>
                <th className="p-2 text-right">Δ</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, idx) => {
                const current = Number(r.stock ?? 0);
                const typed = newStockById[r.id];
                const parsed = typed === undefined || typed === "" ? null : Number(typed);
                const delta =
                  parsed === null || !Number.isFinite(parsed) ? null : parsed - current;

                return (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">
                      <div className="font-medium">{r.name}</div>
                      {r.is_weighted ? (
                        <div className="text-xs text-gray-500">Pesable</div>
                      ) : null}
                    </td>

                    <td className="p-2 text-gray-700">{r.sku ?? "-"}</td>

                    <td className="p-2 text-right tabular-nums">{current}</td>

                    <td className="p-2 text-right">
                      <input
                        ref={idx === 0 ? firstInputRef : undefined}
                        className="w-28 text-right border rounded-lg px-2 py-1 tabular-nums"
                        inputMode="numeric"
                        placeholder="(vacío)"
                        value={typed ?? ""}
                        onChange={(e) => setRowNewStock(r.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") clearRowNewStock(r.id);
                        }}
                      />
                    </td>

                    <td className="p-2 text-right tabular-nums">
                      {delta === null || !Number.isFinite(delta) ? (
                        <span className="text-gray-400">—</span>
                      ) : delta === 0 ? (
                        <span className="text-gray-500">0</span>
                      ) : delta > 0 ? (
                        <span className="text-green-700">+{delta}</span>
                      ) : (
                        <span className="text-red-700">{delta}</span>
                      )}
                    </td>

                    <td className="p-2 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          className="px-2 py-1 rounded-lg border hover:bg-gray-50"
                          onClick={() => copyRowCurrentToNew(r)}
                          title="Copiar actual → nuevo"
                        >
                          =
                        </button>
                        <button
                          className="px-2 py-1 rounded-lg border hover:bg-gray-50"
                          onClick={() => clearRowNewStock(r.id)}
                          title="Limpiar"
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-gray-500" colSpan={6}>
                    {loading ? "Cargando..." : "Sin resultados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-2 p-3 border-t bg-gray-50">
          <div className="text-xs text-gray-600">
            Página <b>{page + 1}</b>
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded-lg border hover:bg-white disabled:opacity-50"
              onClick={goPrevPage}
              disabled={loading || saving || page === 0}
            >
              ← Anterior
            </button>
            <button
              className="px-3 py-2 rounded-lg border hover:bg-white disabled:opacity-50"
              onClick={goNextPage}
              disabled={!canGoNext}
            >
              Siguiente →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
