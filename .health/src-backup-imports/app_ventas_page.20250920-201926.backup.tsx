"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Store = { id: string; name: string };
type Product = { id: string; sku: string; name: string; price: number; stock: number };

export default function VentasPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<{ product: Product; qty: number }[]>([]);
  const [loading, setLoading] = useState(false);

  // cargar sucursales
  useEffect(() => {
    supabase.from("stores").select("id,name").then(({ data }) => {
      setStores(data ?? []);
      if ((data?.length ?? 0) > 0 && !storeId) setStoreId(data![0].id);
    });
  }, []);

  // buscar productos por sucursal
  const searchProducts = async (query: string) => {
    if (!storeId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("products_with_stock", {
      p_store: storeId,
      p_query: query,
      p_limit: 50,
    });
    if (!error) setProducts((data ?? []) as Product[]);
    setLoading(false);
  };

  // agregar al carrito
  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  };

  // confirmar venta
  const confirmSale = async () => {
    if (!storeId || cart.length === 0) return;

    const items = cart.map(c => ({
      product_id: c.product.id,
      qty: c.qty,
      unit_price: c.product.price,
    }));

    const total = items.reduce((acc, i) => acc + i.qty * i.unit_price, 0);

    const res = await fetch("/api/pos/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId,
        items,
        total,
        payment: { method: "cash", cash: total, change: 0 },
      }),
    });

    const json = await res.json();
    if (!json.ok) {
      alert("Error en venta: " + json.error);
      return;
    }

    alert("✅ Venta registrada");
    setCart([]);
    searchProducts("");
  };

  return (
    <div className="mx-auto max-w-5xl p-4">
      <h1 className="text-2xl font-bold mb-4">POS / Ventas</h1>

      <div className="mb-4 flex gap-4">
        <div>
          <label className="block text-sm">Sucursal</label>
          <select
            className="border rounded px-3 py-2"
            value={storeId}
            onChange={e => setStoreId(e.target.value)}
          >
            {stores.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <input
          placeholder="Buscar por nombre o SKU"
          className="border rounded px-3 py-2 w-full"
          onChange={e => searchProducts(e.target.value)}
        />
      </div>

      <div className="border rounded mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">SKU</th>
              <th className="p-2 text-left">Producto</th>
              <th className="p-2 text-left">Precio</th>
              <th className="p-2 text-left">Stock</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} className="border-t">
                <td className="p-2">{p.sku}</td>
                <td className="p-2">{p.name}</td>
                <td className="p-2">${p.price}</td>
                <td className="p-2">{p.stock}</td>
                <td className="p-2">
                  <button
                    className="px-3 py-1 bg-black text-white rounded"
                    onClick={() => addToCart(p)}
                  >
                    Agregar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border rounded p-3">
        <h2 className="font-semibold mb-2">Carrito</h2>
        {cart.length === 0 ? (
          <p className="text-sm text-gray-500">Vacío</p>
        ) : (
          <ul>
            {cart.map(c => (
              <li key={c.product.id}>
                {c.product.name} x{c.qty} — ${c.qty * c.product.price}
              </li>
            ))}
          </ul>
        )}
        <button
          className="mt-3 px-4 py-2 bg-green-600 text-white rounded"
          onClick={confirmSale}
          disabled={cart.length === 0}
        >
          Confirmar venta
        </button>
      </div>
    </div>
  );
}

