"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { posConfirmarVenta } from "@/lib/posConfirm";
import { createClient } from "@supabase/supabase-js";

type Product = { id: string; sku: string; name: string; price: number; stock?: number | null };
type CartItem = Product & { qty: number; subtotal: number };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function VentasPage() {
  const [sku, setSku] = useState("");
  const [nombre, setNombre] = useState("");
  const [qty, setQty] = useState<number>(1);
  const [results, setResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);

  const total = useMemo(() => cart.reduce((a, i) => a + i.subtotal, 0), [cart]);

  const skuRef = useRef<HTMLInputElement>(null);
  useEffect(() => { skuRef.current?.focus(); }, []);

  const buscar = async () => {
    if (!sku && !nombre) { toast("Ingresá SKU o Nombre", { icon: "ℹ️" }); return; }
    try {
      setSearching(true);
      if (sku) {
        const { data, error } = await supabase
          .from("products")
          .select("id, sku, name, price, stock")
          .eq("sku", sku)
          .limit(1);
        if (error) throw error;
        setResults((data ?? []).map((p: any) => ({ id: p.id, sku: p.sku, name: p.name, price: Number(p.price ?? 0), stock: p.stock })));
      } else {
        const { data, error } = await supabase
          .from("products")
          .select("id, sku, name, price, stock")
          .ilike("name", `%${nombre}%`)
          .limit(25);
        if (error) throw error;
        setResults((data ?? []).map((p: any) => ({ id: p.id, sku: p.sku, name: p.name, price: Number(p.price ?? 0), stock: p.stock })));
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error buscando");
    } finally {
      setSearching(false);
    }
  };

  const add = (p: Product, q: number) => {
    if (q <= 0) { toast("Cantidad inválida", { icon: "⚠️" }); return; }
    setCart(prev => {
      const i = prev.findIndex(x => x.id === p.id);
      if (i >= 0) {
        const next = [...prev];
        const newQty = next[i].qty + q;
        next[i] = { ...next[i], qty: newQty, subtotal: newQty * next[i].price };
        return next;
      }
      return [...prev, { ...p, qty: q, subtotal: q * p.price }];
    });
    setSku(""); setNombre(""); setQty(1); setResults([]); skuRef.current?.focus();
  };

  const remove = (id: string) => setCart(prev => prev.filter(i => i.id !== id));
  const clear  = () => setCart([]);

  const confirmar = async () => {
    if (cart.length === 0) { toast("Carrito vacío", { icon: "🛒" }); return; }
    setLoading(true);
    try {
      const items = cart.map(i => ({ product_id: i.id, qty: i.qty, unit_price: i.price }));
      await posConfirmarVenta({ items }); // ajustá si tu firma es distinta
      toast.success("Venta confirmada");
      setCart([]);
      skuRef.current?.focus();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo confirmar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">POS / Ventas</h1>
        <div className="flex gap-2">
          <button disabled={loading || cart.length===0} onClick={confirmar} className="rounded-lg px-4 py-2 bg-black text-white disabled:opacity-50">
            {loading ? "Confirmando..." : "Confirmar venta"}
          </button>
          <button onClick={clear} className="rounded-lg px-4 py-2 border">Vaciar</button>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="block text-sm mb-1">SKU</label>
          <input ref={skuRef} type="text" value={sku} onChange={e=>setSku(e.target.value)} onKeyDown={e=>e.key==="Enter"&&buscar()}
                 placeholder="Escaneá o escribí SKU" className="w-full border rounded-lg px-3 py-2" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm mb-1">Nombre</label>
          <input type="text" value={nombre} onChange={e=>setNombre(e.target.value)} onKeyDown={e=>e.key==="Enter"&&buscar()}
                 placeholder="Buscá por nombre" className="w-full border rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm mb-1">Cantidad</label>
          <input type="number" min={1} value={qty} onChange={e=>setQty(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2" />
        </div>
        <div className="md:col-span-5">
          <button onClick={buscar} disabled={searching} className="rounded-lg px-4 py-2 border">
            {searching ? "Buscando..." : "Buscar"}
          </button>
        </div>
      </section>

      {results.length>0 && (
        <section className="border rounded-xl p-3">
          <div className="mb-2 font-semibold">Resultados</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="text-left border-b"><th className="py-2 pr-2">SKU</th><th className="py-2 pr-2">Nombre</th><th className="py-2 pr-2">Precio</th><th className="py-2 pr-2">Stock</th><th className="py-2"></th></tr></thead>
              <tbody>
                {results.map(p=>(
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">{p.sku}</td>
                    <td className="py-2 pr-2">{p.name}</td>
                    <td className="py-2 pr-2">${p.price.toFixed(2)}</td>
                    <td className="py-2 pr-2">{p.stock ?? "-"}</td>
                    <td className="py-2">
                      <button onClick={()=>add(p, qty)} className="rounded px-3 py-1 bg-black text-white">Agregar x{qty}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="border rounded-xl p-3">
        <div className="mb-2 font-semibold">Carrito</div>
        {cart.length===0 ? <div className="text-sm text-muted-foreground">Vacío</div> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="text-left border-b"><th className="py-2 pr-2">SKU</th><th className="py-2 pr-2">Producto</th><th className="py-2 pr-2">Precio</th><th className="py-2 pr-2">Cantidad</th><th className="py-2 pr-2">Subtotal</th><th className="py-2"></th></tr></thead>
              <tbody>
                {cart.map(it=>(
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">{it.sku}</td>
                    <td className="py-2 pr-2">{it.name}</td>
                    <td className="py-2 pr-2">${it.price.toFixed(2)}</td>
                    <td className="py-2 pr-2">{it.qty}</td>
                    <td className="py-2 pr-2">${it.subtotal.toFixed(2)}</td>
                    <td className="py-2"><button onClick={()=>remove(it.id)} className="rounded px-3 py-1 border">Quitar</button></td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} className="py-2 pr-2 text-right font-semibold">Total</td>
                  <td className="py-2 pr-2 font-semibold">${total.toFixed(2)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
