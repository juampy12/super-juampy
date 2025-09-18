'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Store = { id: string; name: string }
type Product = { id: string; sku: string; name: string; price: number }
type StockRow = { product_id: string; stock: number }

export default function ProductsPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [storeId, setStoreId] = useState<string | null>(null)

  const [products, setProducts] = useState<Product[]>([])
  const [stocks, setStocks] = useState<Record<string, number>>({}) // product_id -> stock

  const [form, setForm] = useState({ sku: '', name: '', price: 0 })

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('stores').select('id,name').order('name')
      setStores(data || [])
      if (!storeId && data && data.length) setStoreId(data[0].id)
    })()
  }, [storeId])

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id,sku,name,price').order('name')
    setProducts(data || [])
  }

  const loadStocks = async () => {
    if (!storeId) return
    const { data } = await supabase
      .from('v_products_with_stock_by_store')
      .select('product_id,stock')
      .eq('store_id', storeId)
    const map: Record<string, number> = {}
    ;(data || []).forEach((r: any) => { map[r.product_id] = Number(r.stock || 0) })
    setStocks(map)
  }

  useEffect(() => { loadProducts() }, [])
  useEffect(() => { loadStocks() }, [storeId])

  const list = useMemo(() => {
    return products.map(p => ({ ...p, stock: stocks[p.id] ?? 0 }))
  }, [products, stocks])

  const saveProduct = async () => {
    if (!form.sku || !form.name) return alert('Completar SKU y nombre')
    const { error } = await supabase.from('products').insert(form)
    if (error) return alert(error.message)
    setForm({ sku: '', name: '', price: 0 })
    await loadProducts()
    await loadStocks()
  }

  const saveStock = async (product_id: string, value: number) => {
    if (!storeId) return alert('Elegí una sucursal')
    const { error } = await supabase
      .from('v_products_with_stock_by_store')
      .upsert({ product_id, store_id: storeId, stock: value })
    if (error) return alert(error.message)
    setStocks(prev => ({ ...prev, [product_id]: value }))
  }

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Productos & Stock por sucursal</h1>

      <div className="flex gap-4 items-end">
        <div>
          <label className="block mb-1 font-medium">Sucursal</label>
          <select value={storeId || ''} onChange={e=>setStoreId(e.target.value)} className="border rounded-xl p-2">
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="text-xs opacity-60">
          El catálogo es global. El stock se edita por sucursal.
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <input aria-label="campo1" id="input1" name="input1" className="border p-2 rounded" placeholder="SKU"
          value={form.sku} onChange={e=>setForm({...form, sku:e.target.value})} />
        <input aria-label="campo2" id="input2" name="input2" className="border p-2 rounded" placeholder="Nombre"
          value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
        <input aria-label="campo3" id="input3" name="input3" className="border p-2 rounded" type="number" placeholder="Precio"
          value={form.price} onChange={e=>setForm({...form, price:Number(e.target.value)})} />
        <button onClick={saveProduct} className="rounded bg-black text-white">Guardar producto</button>
      </div>

      <div className="border rounded-2xl p-4 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th>Nombre</th><th>SKU</th><th>Precio</th><th>Stock ({stores.find(s=>s.id===storeId)?.name || ''})</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.map(p => (
              <tr className="border-b" key={p.id}>
                <td>{p.name}</td>
                <td>{p.sku}</td>
                <td>${p.price.toFixed(2)}</td>
                <td>
                  <input aria-label="campo4" id="input4" name="input4"
                    type="number"
                    className="border rounded p-1 w-24"
                    value={p.stock}
                    onChange={e => setStocks(prev => ({ ...prev, [p.id]: Number(e.target.value) }))}
                  />
                </td>
                <td>
                  <button onClick={() => saveStock(p.id, stocks[p.id] ?? 0)} className="px-3 py-1 rounded border">
                    Guardar
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center opacity-60">Sin productos</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}






