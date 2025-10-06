"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@supabase/supabase-js";

type Product = { id: string; sku: string; name: string; price: number; stock?: number | null };
type CartItem = Product & { qty: number; subtotal: number };
type Store = { id: string; name: string };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const t = setTimeout(()=>setDebounced(value), delay); return ()=>clearTimeout(t); }, [value, delay]);
  return debounced;
}

export default function VentasPage() {
  // --- Sucursal ---
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");

  // --- Búsqueda / carrito ---
  const [sku, setSku] = useState("");
  const [nombre, setNombre] = useState("");
  const [qty, setQty] = useState<number>(1);
  const [results, setResults] = useState<Product[]>([]);
  const [cart,   setCart]   = useState<CartItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading,   setLoading]   = useState(false);

  // --- Pago ---
  const [payMethod, setPayMethod] = useState<"cash"|"debit"|"credit"|"transfer"|"mixed">("cash");
  const [payBreakdown, setPayBreakdown] = useState({ cash: 0, debit: 0, credit: 0, transfer: 0 });

  // 👇 Importe de efectivo como STRING + ref para no perder foco
  const [cashStr, setCashStr] = useState<string>("");
  const cashRef = useRef<HTMLInputElement>(null);

  const debouncedSku = useDebounced(sku, 250);
  const debouncedNombre = useDebounced(nombre, 300);

  const total = useMemo(() => cart.reduce((a, i) => a + i.subtotal, 0), [cart]);

  // Parse seguro del efectivo escrito
  const cashValue = useMemo(() => {
    const v = parseFloat((cashStr || "").replace(",", "."));
    return Number.isFinite(v) ? v : 0;
  }, [cashStr]);

  const change = useMemo(() => Math.max(0, cashValue - total), [cashValue, total]);

  // Cargar sucursales
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("stores").select("id,name").order("name", { ascending: true });
      if (error) { console.error(error); return; }
      setStores(data || []);
      if (!storeId && data && data.length) setStoreId(String(data[0].id));
    })();
  }, []);

  // Si NO es mixto y NO es efectivo => importe bloqueado = total
  useEffect(() => {
    if (payMethod !== "mixed" && payMethod !== "cash") {
      setPayBreakdown({ cash: 0, debit: 0, credit: 0, transfer: 0, [payMethod]: total } as any);
    }
  }, [payMethod, total]);

  // Si dejo efectivo, conservo lo escrito; si cambio a otro, limpio el string
  useEffect(() => {
    if (payMethod !== "cash") setCashStr("");
  }, [payMethod]);

  const skuRef = useRef<HTMLInputElement>(null);
  useEffect(() => { skuRef.current?.focus(); }, []);

  // Buscar
  const buscar = async (opts?: { silent?: boolean }) => {
    const _sku = debouncedSku.trim();
    const _nombre = debouncedNombre.trim();
    if (!_sku && !_nombre) { if (!opts?.silent) setResults([]); return; }
    try {
      setSearching(true);
      if (_sku) {
        const { data, error } = await supabase.from("products").select("id, sku, name, price, stock").eq("sku", _sku).limit(1);
        if (error) throw error;
        setResults((data ?? []).map((p:any)=>({ id:p.id, sku:p.sku, name:p.name, price:Number(p.price??0), stock:p.stock })));
      } else {
        const { data, error } = await supabase.from("products").select("id, sku, name, price, stock").ilike("name", `%${_nombre}%`).limit(25);
        if (error) throw error;
        setResults((data ?? []).map((p:any)=>({ id:p.id, sku:p.sku, name:p.name, price:Number(p.price??0), stock:p.stock })));
      }
    } catch (e:any) {
      if (!opts?.silent) toast.error(e?.message ?? "Error buscando");
    } finally { setSearching(false); }
  };
  useEffect(() => {
    if (debouncedSku.length >= 3 || debouncedNombre.length >= 1) buscar({ silent:true });
    else setResults([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSku, debouncedNombre]);

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
    if (!storeId) { toast.error("Elegí una sucursal"); return; }
    if (cart.length === 0) { toast("Carrito vacío", { icon: "🛒" }); return; }

    // Validación pago
    let payment: any = { method: payMethod };
    if (payMethod === "mixed") {
      const suma = (payBreakdown.cash||0)+(payBreakdown.debit||0)+(payBreakdown.credit||0)+(payBreakdown.transfer||0);
      if (Math.round(suma*100) !== Math.round(total*100)) {
        toast.error("En pago mixto, la suma debe igualar el total.");
        return;
      }
      payment = { method: "mixed", ...payBreakdown };
    } else if (payMethod === "cash") {
      payment = { method: "cash", cash: cashValue, change };
    } else {
      payment = { method: payMethod, [payMethod]: total };
    }

    setLoading(true);
    try {
      const items = cart.map(i => ({ product_id: i.id, qty: i.qty, unit_price: i.price }));
      const payload = { items, total, payment, storeId };

      const res = await fetch("/api/pos/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(()=> ({} as any));
      if (!res.ok || j?.ok === false) throw new Error(j?.error || "No se pudo confirmar");

      toast.success(j?.simulated ? "Venta confirmada (simulada)" : "Venta confirmada");
      setCart([]);
      setCashStr("");
      skuRef.current?.focus();
    } catch (e:any) {
      toast.error(e?.message ?? "No se pudo confirmar");
    } finally { setLoading(false); }
  };

  // --- UI Pago ---
  const ImporteSimpleBloqueado = () => (
    <input type="number" readOnly value={total.toFixed(2)} className="w-full border rounded-xl px-3 py-2 bg-gray-50 text-gray-600" />
  );

  const ImporteEfectivoEditable = () => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setCashStr(val);
      // Re-enfocar y mantener cursor al final después del re-render
      requestAnimationFrame(() => {
        const el = cashRef.current;
        if (el) {
          const pos = el.value.length;
          el.focus();
          try { el.setSelectionRange(pos, pos); } catch {}
        }
      });
    };
    return (
      <input
        ref={cashRef}
        type="text"
        inputMode="decimal"
        step="0.01"
        value={cashStr}
        onChange={handleChange}
        placeholder="Importe recibido"
        className="w-full border rounded-xl px-3 py-2"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
    );
  };

  const PagoUI = () => (
    <div className="rounded-2xl border bg-white/70 backdrop-blur p-4 md:p-5 shadow-sm space-y-3">
      {/* Sucursal */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="block text-sm mb-1">Sucursal</label>
          <select className="border rounded-xl px-3 py-2 w-full" value={storeId} onChange={(e)=>setStoreId(e.target.value)}>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Medio / Importe / Total / Acciones */}
        <div>
          <label className="block text-sm mb-1">Medio de pago</label>
          <select className="border rounded-xl px-3 py-2 w-full" value={payMethod} onChange={(e)=>setPayMethod(e.target.value as any)}>
            <option value="cash">Efectivo</option>
            <option value="debit">Débito</option>
            <option value="credit">Crédito</option>
            <option value="transfer">Transferencia</option>
            <option value="mixed">Mixto</option>
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">Importe</label>
          {payMethod === "cash" ? (
            <ImporteEfectivoEditable />
          ) : payMethod === "mixed" ? (
            <div className="grid grid-cols-2 gap-2">
              {(["cash","debit"] as const).map(k => (
                <input key={k} type="number" min={0} placeholder={k}
                  value={(payBreakdown as any)[k] ?? 0}
                  onChange={(e)=>setPayBreakdown(b => ({ ...b, [k]: Number(e.target.value || 0) }))}
                  className="w-full border rounded-xl px-3 py-2" />
              ))}
              {(["credit","transfer"] as const).map(k => (
                <input key={k} type="number" min={0} placeholder={k}
                  value={(payBreakdown as any)[k] ?? 0}
                  onChange={(e)=>setPayBreakdown(b => ({ ...b, [k]: Number(e.target.value || 0) }))}
                  className="w-full border rounded-xl px-3 py-2" />
              ))}
            </div>
          ) : (
            <ImporteSimpleBloqueado />
          )}
        </div>

        <div>
          <label className="block text-sm mb-1">Total</label>
          <div className="px-3 py-2 border rounded-xl bg-gray-50 font-semibold">${total.toFixed(2)}</div>
          {payMethod === "cash" && cashStr && (
            <div className="text-xs mt-1 text-gray-600">Vuelto: <b>${change.toFixed(2)}</b></div>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button disabled={loading || cart.length===0} onClick={confirmar} className="rounded-lg px-4 py-2 bg-black text-white disabled:opacity-50 shadow">
            {loading ? "Confirmando..." : "Confirmar venta"}
          </button>
          <button onClick={clear} className="rounded-lg px-4 py-2 border bg-white hover:bg-gray-50 shadow">Vaciar</button>
        </div>
      </div>
    </div>
  );

  return (
    <main className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">POS / Ventas</h1>

      <PagoUI />

      {/* Buscador */}
      <section className="rounded-2xl border bg-white/70 backdrop-blur p-4 md:p-5 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">SKU</label>
            <input ref={skuRef} type="text" value={sku} onChange={e=>setSku(e.target.value)} onKeyDown={e=>e.key==="Enter"&&buscar()} placeholder="Escaneá o escribí SKU" className="w-full border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">Nombre</label>
            <input type="text" value={nombre} onChange={e=>setNombre(e.target.value)} onKeyDown={e=>e.key==="Enter"&&buscar()} placeholder="Buscá por nombre" className="w-full border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20" />
          </div>
          <div>
            <label className="block text-sm mb-1">Cantidad</label>
            <input type="number" min={1} value={qty} onChange={e=>setQty(Number(e.target.value))} className="w-full border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20" />
          </div>
          <div className="md:col-span-5">
            <button onClick={()=>buscar()} disabled={searching} className="rounded-xl px-4 py-2 border bg-white hover:bg-gray-50 shadow-sm">
              {searching ? "Buscando..." : "Buscar"}
            </button>
          </div>
        </div>
      </section>

      {/* Resultados */}
      <section className="rounded-2xl border bg-white/70 backdrop-blur p-4 md:p-5 shadow-sm">
        <div className="mb-2 font-semibold text-lg">Resultados</div>
        {results.length===0 ? (
          <div className="text-sm text-gray-500">Escribí SKU o nombre para buscar.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left border-b">
                  <th className="py-2 px-3">SKU</th>
                  <th className="py-2 px-3">Nombre</th>
                  <th className="py-2 px-3">Precio</th>
                  <th className="py-2 px-3">Stock</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {results.map(p=>(
                  <tr key={p.id} className="border-t">
                    <td className="py-2 px-3">{p.sku}</td>
                    <td className="py-2 px-3">{p.name}</td>
                    <td className="py-2 px-3">${p.price.toFixed(2)}</td>
                    <td className="py-2 px-3">{p.stock ?? "-"}</td>
                    <td className="py-2 px-3">
                      <button onClick={()=>add(p, qty)} className="rounded-lg px-3 py-1 bg-black text-white shadow">Agregar x{qty}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Carrito */}
      <section className="rounded-2xl border bg-white/70 backdrop-blur p-4 md:p-5 shadow-sm">
        <div className="mb-2 font-semibold text-lg">Carrito</div>
        {cart.length===0 ? (
          <div className="text-sm text-gray-500">Vacío</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left border-b">
                  <th className="py-2 px-3">SKU</th>
                  <th className="py-2 px-3">Producto</th>
                  <th className="py-2 px-3">Precio</th>
                  <th className="py-2 px-3">Cantidad</th>
                  <th className="py-2 px-3">Subtotal</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {cart.map(it=>(
                  <tr key={it.id} className="border-t">
                    <td className="py-2 px-3">{it.sku}</td>
                    <td className="py-2 px-3">{it.name}</td>
                    <td className="py-2 px-3">${it.price.toFixed(2)}</td>
                    <td className="py-2 px-3">{it.qty}</td>
                    <td className="py-2 px-3">${it.subtotal.toFixed(2)}</td>
                    <td className="py-2 px-3">
                      <button onClick={()=>remove(it.id)} className="rounded-lg px-3 py-1 border bg-white hover:bg-gray-50 shadow-sm">Quitar</button>
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50">
                  <td colSpan={4} className="py-2 px-3 text-right font-semibold">Total</td>
                  <td className="py-2 px-3 font-semibold">${total.toFixed(2)}</td>
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
