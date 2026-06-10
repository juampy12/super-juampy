"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getPosEmployee } from "@/lib/posSession";
import { supabase } from "@/app/lib/supabase";
import * as XLSX from "xlsx";

type ExcelRow = Record<string, string | number | null>;

type DetectedColumns = {
  skuCol: string | null;
  priceCols: string[];
};

type ProductMatch = {
  sku: string;
  excelName: string;
  dbId: string;
  dbName: string;
  currentPrice: number;
  importedPrice: number;
  finalPrice: number;
  diffPct: number;
};

type Summary = {
  updated: number;
  notFound: number;
  errors: string[];
};

function detectColumns(headers: string[]): DetectedColumns {
  const skuKeywords = ["barra", "ean", "codigo", "código"];
  const priceKeywords = ["precio"];

  const skuCol =
    headers.find((h) =>
      skuKeywords.some((k) => h.toLowerCase().includes(k))
    ) ?? null;

  const priceCols = headers.filter((h) =>
    priceKeywords.some((k) => h.toLowerCase().includes(k))
  );

  return { skuCol, priceCols };
}

function parsePrice(v: string | number | null): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function ImportarPreciosPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [loading, setLoading] = useState(false);

  // parsed excel
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [detected, setDetected] = useState<DetectedColumns>({ skuCol: null, priceCols: [] });

  // user selections
  const [priceCol, setPriceCol] = useState("");
  const [margin, setMargin] = useState(0);

  // matches
  const [matched, setMatched] = useState<ProductMatch[]>([]);
  const [notFound, setNotFound] = useState<{ sku: string; name: string }[]>([]);

  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const emp = getPosEmployee();
    if (emp?.role !== "supervisor") {
      router.replace("/ventas");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const parsed: ExcelRow[] = XLSX.utils.sheet_to_json(ws, { defval: null });

        if (parsed.length === 0) {
          alert("El archivo está vacío o no tiene datos legibles.");
          return;
        }

        const hdrs = Object.keys(parsed[0]);
        const det = detectColumns(hdrs);

        setHeaders(hdrs);
        setRows(parsed);
        setDetected(det);
        setPriceCol(det.priceCols[0] ?? "");
        setMatched([]);
        setNotFound([]);
        setSummary(null);
        setStep("upload");
      } catch {
        alert("Error al leer el archivo. Verificá que sea un Excel válido.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function buildPreview() {
    if (!detected.skuCol) {
      alert("No se detectó columna de código de barras. Verificá el Excel.");
      return;
    }
    if (!priceCol) {
      alert("Seleccioná una columna de precio.");
      return;
    }

    setLoading(true);
    try {
      // Collect unique SKUs from Excel
      const skuSet = new Set<string>();
      const skuToRow: Record<string, ExcelRow> = {};

      for (const row of rows) {
        const raw: string | number | null = row[detected.skuCol!];
        if (!raw && raw !== 0) continue;
        const sku = String(raw).trim();
        if (sku) {
          skuSet.add(sku);
          skuToRow[sku] = row;
        }
      }

      const skus = Array.from(skuSet);
      if (skus.length === 0) {
        alert("No se encontraron códigos de barras en el archivo.");
        return;
      }

      // Lookup in DB in batches of 500
      const batchSize = 500;
      const dbProducts: { id: string; sku: string; name: string; price: number }[] = [];

      for (let i = 0; i < skus.length; i += batchSize) {
        const batch = skus.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from("products")
          .select("id, sku, name, price")
          .in("sku", batch)
          .eq("active", true);

        if (error) throw error;
        dbProducts.push(...((data ?? []) as typeof dbProducts));
      }

      const dbBySku: Record<string, typeof dbProducts[0]> = {};
      for (const p of dbProducts) {
        if (p.sku) dbBySku[p.sku] = p;
      }

      const matchedList: ProductMatch[] = [];
      const notFoundList: { sku: string; name: string }[] = [];

      for (const sku of skus) {
        const excelRow = skuToRow[sku];
        const excelName = String(excelRow["Detalle"] ?? excelRow["detalle"] ?? "").trim();
        const importedPrice = parsePrice(excelRow[priceCol]);

        if (dbBySku[sku]) {
          const db = dbBySku[sku];
          const finalPrice = Math.round(importedPrice * (1 + margin / 100) * 100) / 100;
          const currentPrice = db.price ?? 0;
          const diffPct =
            currentPrice > 0
              ? Math.round(((finalPrice - currentPrice) / currentPrice) * 10000) / 100
              : 0;

          matchedList.push({
            sku,
            excelName,
            dbId: db.id,
            dbName: db.name,
            currentPrice,
            importedPrice,
            finalPrice,
            diffPct,
          });
        } else {
          notFoundList.push({ sku, name: excelName });
        }
      }

      matchedList.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));

      setMatched(matchedList);
      setNotFound(notFoundList);
      setStep("preview");
    } catch (e: any) {
      alert(`Error consultando la base de datos: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  async function applyPrices() {
    if (matched.length === 0) return;
    if (!window.confirm(`¿Aplicar precios a ${matched.length} productos?`)) return;

    setLoading(true);
    try {
      const updates = matched.map((m) => ({ productId: m.dbId, price: m.finalPrice }));

      const res = await fetch("/api/products/bulk-price-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      const json = await res.json().catch(() => ({}));
      if (!json?.ok) {
        alert(`Error aplicando precios: ${json?.error ?? "desconocido"}`);
        return;
      }

      setSummary({ updated: json.updated, notFound: notFound.length, errors: json.errors ?? [] });
      setStep("done");
    } catch (e: any) {
      alert(`Error: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("upload");
    setHeaders([]);
    setRows([]);
    setDetected({ skuCol: null, priceCols: [] });
    setPriceCol("");
    setMargin(0);
    setMatched([]);
    setNotFound([]);
    setSummary(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // Recompute preview when margin changes
  function handleMarginChange(val: number) {
    setMargin(val);
    if (step === "preview") {
      setMatched((prev) =>
        prev.map((m) => {
          const finalPrice = Math.round(m.importedPrice * (1 + val / 100) * 100) / 100;
          const diffPct =
            m.currentPrice > 0
              ? Math.round(((finalPrice - m.currentPrice) / m.currentPrice) * 10000) / 100
              : 0;
          return { ...m, finalPrice, diffPct };
        })
      );
    }
  }

  const fmt = (n: number) =>
    n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="mx-auto max-w-5xl p-4">
      <h1 className="text-2xl font-semibold mb-1">Importar precios desde Excel</h1>
      <p className="text-gray-500 text-sm mb-6">
        Actualizá precios en masa usando el archivo Excel del proveedor.
      </p>

      {/* Step: Upload */}
      {step === "upload" && (
        <div className="border rounded-lg p-6 bg-white max-w-xl">
          <h2 className="font-semibold text-lg mb-4">1. Subir archivo</h2>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Archivo Excel (.xlsx o .xls)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              className="block w-full text-sm border rounded px-3 py-2 cursor-pointer"
            />
          </div>

          {headers.length > 0 && (
            <div className="mt-4 space-y-4">
              <div className="bg-gray-50 rounded p-3 text-sm">
                <p className="font-medium mb-1">Columnas detectadas:</p>
                <p>
                  <span className="font-medium">Código de barras: </span>
                  {detected.skuCol ? (
                    <span className="text-green-700 font-semibold">{detected.skuCol}</span>
                  ) : (
                    <span className="text-red-600">No detectada</span>
                  )}
                </p>
                <p className="mt-1">
                  <span className="font-medium">Columnas de precio: </span>
                  {detected.priceCols.length > 0 ? (
                    <span className="text-green-700">{detected.priceCols.join(", ")}</span>
                  ) : (
                    <span className="text-red-600">No detectadas</span>
                  )}
                </p>
                <p className="mt-1 text-gray-500">{rows.length} filas en el archivo</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Columna de precio a usar
                </label>
                <select
                  className="border rounded px-3 py-2 w-full"
                  value={priceCol}
                  onChange={(e) => setPriceCol(e.target.value)}
                >
                  <option value="">— Elegir columna —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Margen de ganancia a aplicar (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    className="border rounded px-3 py-2 w-28"
                    value={margin}
                    onChange={(e) => setMargin(Number(e.target.value))}
                  />
                  <span className="text-gray-500 text-sm">
                    {margin > 0 ? `+${margin}% sobre el precio importado` : "Sin margen adicional"}
                  </span>
                </div>
              </div>

              <button
                onClick={buildPreview}
                disabled={loading || !detected.skuCol || !priceCol}
                className="bg-blue-700 text-white rounded px-5 py-2 font-medium disabled:opacity-50 w-full"
              >
                {loading ? "Consultando productos..." : "Ver vista previa →"}
              </button>
            </div>
          )}

          {headers.length === 0 && (
            <div className="mt-4 text-sm text-gray-500">
              <p className="font-medium mb-1">Formato esperado del Excel del proveedor:</p>
              <ul className="list-disc ml-5 space-y-1">
                <li><strong>Cod.Barra</strong> — código de barras (SKU)</li>
                <li><strong>Detalle</strong> — nombre del producto</li>
                <li><strong>Precio/SI</strong> — precio sin IVA</li>
                <li><strong>Precio/CI</strong> — precio con IVA</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Step: Preview */}
      {step === "preview" && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <button
              onClick={() => setStep("upload")}
              className="text-sm text-gray-600 underline"
            >
              ← Volver
            </button>
            <span className="text-sm text-gray-500">
              <strong>{matched.length}</strong> encontrados ·{" "}
              <strong>{notFound.length}</strong> no encontrados
            </span>
          </div>

          {/* Controls */}
          <div className="flex gap-4 mb-4 items-end flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Columna de precio
              </label>
              <select
                className="border rounded px-3 py-2 text-sm"
                value={priceCol}
                onChange={async (e) => {
                  setPriceCol(e.target.value);
                  // Rebuild preview with new price column
                  const col = e.target.value;
                  setMatched((prev) =>
                    prev.map((m) => {
                      const excelRow = rows.find(
                        (r) => String(r[detected.skuCol!] ?? "").trim() === m.sku
                      );
                      const importedPrice = excelRow ? parsePrice(excelRow[col]) : m.importedPrice;
                      const finalPrice = Math.round(importedPrice * (1 + margin / 100) * 100) / 100;
                      const diffPct =
                        m.currentPrice > 0
                          ? Math.round(((finalPrice - m.currentPrice) / m.currentPrice) * 10000) / 100
                          : 0;
                      return { ...m, importedPrice, finalPrice, diffPct };
                    })
                  );
                }}
              >
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Margen adicional (%)
              </label>
              <input
                type="number"
                min={0}
                step={0.5}
                className="border rounded px-3 py-2 w-24 text-sm"
                value={margin}
                onChange={(e) => handleMarginChange(Number(e.target.value))}
              />
            </div>

            <button
              onClick={applyPrices}
              disabled={loading || matched.length === 0}
              className="bg-emerald-700 text-white rounded px-5 py-2 font-medium disabled:opacity-50"
            >
              {loading ? "Aplicando..." : `Aplicar precios (${matched.length})`}
            </button>
          </div>

          {/* Matched products */}
          {matched.length > 0 && (
            <div className="border rounded bg-white overflow-auto mb-6">
              <div className="bg-gray-50 px-4 py-2 border-b text-sm font-medium text-gray-700">
                Productos encontrados en la base de datos ({matched.length})
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600">
                  <tr>
                    <th className="p-2 text-left">Producto (DB)</th>
                    <th className="p-2 text-left">Nombre Excel</th>
                    <th className="p-2 text-right">Precio actual</th>
                    <th className="p-2 text-right">Precio importado</th>
                    {margin > 0 && <th className="p-2 text-right">Precio final (+{margin}%)</th>}
                    <th className="p-2 text-right">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {matched.map((m) => (
                    <tr key={m.sku} className="border-t hover:bg-gray-50">
                      <td className="p-2">
                        <div className="font-medium">{m.dbName}</div>
                        <div className="text-xs text-gray-500">{m.sku}</div>
                      </td>
                      <td className="p-2 text-gray-500 text-xs">{m.excelName || "—"}</td>
                      <td className="p-2 text-right">${fmt(m.currentPrice)}</td>
                      <td className="p-2 text-right">${fmt(m.importedPrice)}</td>
                      {margin > 0 && (
                        <td className="p-2 text-right font-semibold">${fmt(m.finalPrice)}</td>
                      )}
                      <td
                        className={`p-2 text-right font-semibold ${
                          m.diffPct > 0
                            ? "text-red-600"
                            : m.diffPct < 0
                            ? "text-emerald-600"
                            : "text-gray-400"
                        }`}
                      >
                        {m.diffPct > 0 ? "+" : ""}
                        {m.diffPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Not found */}
          {notFound.length > 0 && (
            <div className="border rounded bg-white overflow-auto">
              <div className="bg-amber-50 px-4 py-2 border-b text-sm font-medium text-amber-700">
                Productos no encontrados en la base de datos ({notFound.length}) — no se actualizarán
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600">
                  <tr>
                    <th className="p-2 text-left">Código de barras</th>
                    <th className="p-2 text-left">Nombre en Excel</th>
                  </tr>
                </thead>
                <tbody>
                  {notFound.map((nf) => (
                    <tr key={nf.sku} className="border-t">
                      <td className="p-2 font-mono text-gray-700">{nf.sku}</td>
                      <td className="p-2 text-gray-500">{nf.name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && summary && (
        <div className="max-w-lg border rounded-lg p-6 bg-white">
          <div className="text-5xl mb-4 text-center">✅</div>
          <h2 className="text-xl font-semibold text-center mb-6">Importación completada</h2>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Productos actualizados</span>
              <span className="font-bold text-emerald-700 text-lg">{summary.updated}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">No encontrados (sin cambios)</span>
              <span className="font-bold text-amber-600 text-lg">{summary.notFound}</span>
            </div>
            {summary.errors.length > 0 && (
              <div className="py-2 border-b">
                <span className="text-gray-600">Errores ({summary.errors.length})</span>
                <ul className="mt-1 text-xs text-red-600 space-y-1">
                  {summary.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {summary.errors.length > 5 && (
                    <li>...y {summary.errors.length - 5} más</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 border rounded px-4 py-2 text-sm"
            >
              Nueva importación
            </button>
            <a
              href="/products"
              className="flex-1 bg-blue-700 text-white rounded px-4 py-2 text-sm text-center"
            >
              Ver precios
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
