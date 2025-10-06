"use client"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

type Store   = { id: string; name: string }
type Product = { id: string; sku: string; name: string; price: number }
type StockRow = { product_id: string; store_id: string; stock: number }

export default function ProductsPage() {
  console.log("DEBUG_PRODUCTS: rendering from app\\products\\page.tsx (UI FIX)")

  const [stores, setStores] = useState<Store[]>([])
  const [storeId, setStoreId] = useState<string | null>(null)

  const [products, setProducts] = useState<Product[]>([])
  const [stocks, setStocks] = useState<Record<string, number>>({}) // DB (verdad)
  const [edits, setEdits] = useState<Record<string, number>>({})   // Nuevo (borrador controlado)

  const [form, setForm] = useState({ sku: "", name: "", price: 0 })

  useEffect(() => { (async () => {
    const { data, error } = await supabase.from("stores").select("id,name").order("name")
    if (error) { console.error(error); return }
    if (data && data.length) { setStores(data); if (!storeId) setStoreId(data[0].id) }
  })() }, [])

  const loadProducts = async () => {
    const { data, error } = await supabase.from("products").select("id,sku,name,price").order("name")
    if (error) { alert(error.message); return }
    setProducts((data || []).map((p:any) => ({ id:p.id, sku:p.sku??"", name:p.name??"", price:Number(p.price??0) })))
  }

  const loadStocks = async () => {
    if (!storeId) return
    const { data, error } = await supabase
      .from("v_products_with_stock_by_store")
      .select("product_id,store_id,stock")
      .eq("store_id", storeId)
    if (error) { alert(error.message); return }
    const map: Record<string, number> = {}
    ;(data as StockRow[] || []).forEach(r => { map[r.product_id] = Number(r.stock||0) })
    setStocks(map)
    setEdits({}) // limpiamos borradores; inputs usarán value controlado con fallback al actual
  }

  useEffect(() => { loadProducts() }, [])
  useEffect(() => { loadStocks() }, [storeId])

  useEffect(() => {
    if (!storeId) return
    const ch = supabase
      .channel("stock-movements-"+storeId)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "stock_movements", filter: `store_id=eq.${storeId}` },
        () => { loadStocks() }
      )
      .subscribe()
    const id = setInterval(() => { loadStocks() }, 8000)
    return () => { supabase.removeChannel(ch); clearInterval(id) }
  }, [storeId])

  // Ahora “desired” (lo que se ve en “Nuevo”) es el edit si existe; si no, el actual de DB.
  const list = useMemo(() =>
    products.map(p => ({
      ...p,
      actual: stocks[p.id] ?? 0,
      desired: (edits[p.id] ?? (stocks[p.id] ?? 0))
    })),
  [products, stocks, edits])

  const saveProduct = async () => {
    if (!form.sku || !form.name) return alert("Completar SKU y nombre")
    const { error } = await supabase.from("products").insert({ sku: form.sku, name: form.name, price: Number(form.price||0) })
    if (error) return alert(error.message)
    setForm({ sku:"", name:"", price:0 }); await loadProducts(); await loadStocks()
  }

  const saveStock = async (product_id: string, target: number) => {
    if (!storeId) return alert("Elegí una sucursal")
    const { error } = await supabase.rpc("fn_set_stock", { p_product_id: product_id, p_store_id: storeId, p_target: Number(target) })
    if (error) return alert(error.message)
    await loadStocks()
  }

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Productos & Stock por sucursal</h1>

      <div className="flex gap-3 items-end">
        <div>
          <label className="block mb-1 font-medium">Sucursal</label>
          <select value={storeId || ""} onChange={e=>setStoreId(e.target.value)} className="border rounded-xl p-2">
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <button onClick={() => loadStocks()} className="px-3 py-2 rounded border">Refrescar</button>
        <div className="text-xs opacity-60">El catálogo es global. El stock se calcula con movimientos.</div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <input className="border p-2 rounded" placeholder="SKU" value={form.sku} onChange={e=>setForm({...form, sku:e.target.value})} />
        <input className="border p-2 rounded" placeholder="Nombre" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
        <input className="border p-2 rounded" type="number" placeholder="Precio" value={form.price} onChange={e=>setForm({...form, price:Number(e.target.value)})} />
        <button onClick={saveProduct} className="rounded bg-black text-white px-3 py-2">Guardar producto</button>
      </div>

      <div className="border rounded-2xl p-4 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th>Nombre</th><th>SKU</th><th>Precio</th>
              <th>Actual (DB)</th><th>Nuevo</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.map(p => (
              <tr className="border-b" key={p.id}>
                <td>{p.name}</td>
                <td>{p.sku}</td>
                <td>${Number(p.price||0).toFixed(2)}</td>
                <td className="font-mono">{p.actual}</td>
                <td>
                  <input
                    type="number"
                    className="border rounded p-1 w-24"
                    value={p.desired}
                    onChange={e => setEdits(prev => ({ ...prev, [p.id]: Number(e.target.value) }))}
                  />
                </td>
                <td>
                  <button onClick={() => saveStock(p.id, (edits[p.id] ?? p.actual))} className="px-3 py-1 rounded border">
                    Guardar
                  </button>
                </td>
              </tr>
            ))}
            {list.length===0 && <tr><td colSpan={6} className="py-6 text-center opacity-60">Sin productos</td></tr>}
          </tbody>
        </table>

        <div style={{fontSize:12,opacity:.7,marginTop:8}}>
          DEBUG_PRODUCTS — UI FIX (controlado)
        </div>
      </div>
    </main>
  )
}
