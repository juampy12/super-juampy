"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Store = { id: string; name: string };
type Row = { id: string; sku: string; name: string; price: number; stock: number };
type CartLine = { product_id: string; sku: string; name: string; price: number; qty: number };

export default function POSPage() {
  // Sucursal
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");

  // Búsqueda
  const [sku, setSku] = useState("");
  const [nameQ, setNameQ] = useState("");
  const [qty, setQty] = useState<number>(1);
  const [results, setResults] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0); // 👈 fuerza recarga

  // Carrito
  const [cart, setCart] = useState<CartLine[]>([]);

  // Pago
  const [method, setMethod] = useState<"cash"|"debit"|"credit">("cash");
  const [cash, setCash] = useState<number | "">("");

  // Totales
  const total = useMemo(
    () => cart.reduce((acc, l) => acc + l.price * l.qty, 0),
    [cart]
  );
  const change = useMemo(() => {
    if (method !== "cash") return 0;
    const c = Number(cash || 0);
    return Math.max(0, c - total);
  }, [method, cash, total]);

  // Cargar sucursales
  useEffect(() => {
    supabase.from("stores").select("id,name").order("name", { ascending: true })
      .then(({ data }) => {
        setStores(data ?? []);
        if ((data?.length ?? 0) > 0 && !storeId) setStoreId(data![0].id);
      });
  }, []);

  // Buscar productos (RPC con stock por sucursal)
  useEffect(() => {
    const load = async () => {
      if (!storeId) return;
      setLoading(true);

      // si hay SKU, priorizamos SKU; si no, nombre
      const q = (sku.trim() || nameQ.trim()) || null;

      const { data, error } = await supabase.rpc("products_with_stock", {
        p_store: storeId,
        p_query: q,
        p_limit: 50
      });

      if (!error) setResults((data ?? []) as Row[]);
      setLoading(false);
    };
    load();
  }, [storeId, sku, nameQ, refreshTick]); // 👈 se refresca tras confirmar

  const addToCart = (r: Row) => {
    const n = Number(qty || 1);
    if (!n || n <= 0) return;

    setCart((old) => {
      const i = old.findIndex(x => x.product_id === r.id);
      if (i >= 0) {
        const c = [...old];
        c[i] = { ...c[i], qty: c[i].qty + n };
        return c;
      }
      return [...old, { product_id: r.id, sku: r.sku, name: r.name, price: Number(r.price || 0), qty: n }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart((old) => old.filter(x => x.product_id !== id));
  };

  const clearCart = () => setCart([]);

  const confirmSale = async () => {
    if (!storeId) return alert("Seleccioná una sucursal.");
    if (cart.length === 0) return alert("El carrito está vacío.");

    const body: any = {
      items: cart.map(l => ({ product_id: l.product_id, qty: l.qty, unit_price: l.price })),
      total,
      payment: method === "cash"
        ? { method, cash: Number(cash || 0), change }
        : { method },
      storeId
    };

    const res = await fetch("/api/pos/confirm", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (!json?.ok) {
      alert("Error al confirmar: " + (json?.error ?? "desconocido"));
      return;
    }

    // ✅ limpiar carrito y refrescar resultados para ver stock actualizado
    clearCart();
    setRefreshTick(t => t + 1);
    if (method === "cash") setCash("");
    alert("Venta registrada.");
  };

  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="text-2xl font-semibold mb-4">POS / Ventas</h1>

      {/* Cabecera: sucursal & pago */}
      <div className="border rounded p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm mb-1">Sucursal</label>
            <select className="border rounded px-3 py-2 w-full" value={storeId} onChange={e => setStoreId(e.target.value)}>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">Medio de pago</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={method}
              onChange={e => setMethod(e.target.value as any)}
            >
              <option value="cash">Efectivo</option>
              <option value="debit">Débito</option>
              <option value="credit">Crédito</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">{method === "cash" ? "Importe recibido" : "Importe"}</label>
            <input
              type="number"
              className="border rounded px-3 py-2 w-full"
              placeholder={method === "cash" ? "Importe recibido" : "0"}
              value={method === "cash" ? (cash === "" ? "" : String(cash)) : String(total.toFixed(2))}
              onChange={e => setCash(Number(e.target.value))}
              disabled={method !== "cash"}
              step="0.01"
              min="0"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Total</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={`$${total.toFixed(2)}`}
              readOnly
            />
            {method === "cash" && (
              <p className="text-xs text-gray-600 mt-1">Vuelto: <strong>${change.toFixed(2)}</strong></p>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button className="px-4 py-2 rounded bg-black text-white" onClick={confirmSale}>
            Confirmar venta
          </button>
          <button className="px-4 py-2 rounded border" onClick={clearCart}>Vaciar</button>
        </div>
      </div>

      {/* Buscador */}
      <div className="border rounded p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm mb-1">SKU</label>
            <input
              className="border rounded px-3 py-2 w-full"
              placeholder="Escaneá o escribí SKU"
              value={sku}
              onChange={e => setSku(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setRefreshTick(t => t + 1); }}
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Nombre</label>
            <input
              className="border rounded px-3 py-2 w-full"
              placeholder="Buscá por nombre"
              value={nameQ}
              onChange={e => setNameQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setRefreshTick(t => t + 1); }}
            />
          </div>

            <div>
              <label className="block text-sm mb-1">Cantidad</label>
              <input
                type="number"
                className="border rounded px-3 py-2 w-full"
                value={String(qty)}
                min={1}
                onChange={e => setQty(Number(e.target.value))}
              />
            </div>
        </div>

        <div className="mt-3">
          <button className="px-4 py-2 rounded bg-black text-white" onClick={() => setRefreshTick(t => t + 1)} disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>
      </div>

      {/* Resultados */}
      <div className="border rounded overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">SKU</th>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 text-left">Precio</th>
              <th className="p-2 text-left">Stock</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {results.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.sku}</td>
                <td className="p-2">{r.name}</td>
                <td className="p-2">${Number(r.price ?? 0).toFixed(2)}</td>
                <td className="p-2">{Number(r.stock ?? 0)}</td>
                <td className="p-2">
                  <button className="px-3 py-1 rounded bg-black text-white" onClick={() => addToCart(r)}>
                    Agregar x{qty || 1}
                  </button>
                </td>
              </tr>
            ))}
            {results.length === 0 && (
              <tr><td className="p-2" colSpan={5}>Escribí SKU o nombre para buscar.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Carrito */}
      <div className="border rounded p-4">
        <h2 className="font-semibold mb-3">Carrito</h2>
        {cart.length === 0 ? (
          <p className="text-sm text-gray-600">Vacío</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left">SKU</th>
                  <th className="p-2 text-left">Producto</th>
                  <th className="p-2 text-left">Precio</th>
                  <th className="p-2 text-left">Cantidad</th>
                  <th className="p-2 text-left">Subtotal</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map(l => (
                  <tr key={l.product_id} className="border-t">
                    <td className="p-2">{l.sku}</td>
                    <td className="p-2">{l.name}</td>
                    <td className="p-2">${l.price.toFixed(2)}</td>
                    <td className="p-2">{l.qty}</td>
                    <td className="p-2">${(l.price * l.qty).toFixed(2)}</td>
                    <td className="p-2">
                      <button className="px-3 py-1 rounded border" onClick={() => removeFromCart(l.product_id)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t">
                  <td className="p-2" colSpan={4}><strong>Total</strong></td>
                  <td className="p-2"><strong>${total.toFixed(2)}</strong></td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
