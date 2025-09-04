'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import AuthGuard from '../../components/AuthGuard'

type InvRow = {
  product_id: string
  name: string
  sku: string | null
  barcode: string | null
  price: number | null
  store_id: string
  store_name: string
  qty: number
}

function InventoryInner() {
  const [rows, setRows] = useState<InvRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // alta rápida
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [price, setPrice] = useState<number>(0)

  // edición rápida
  const [editId, setEditId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState<number>(0)
  const [editActive, setEditActive] = useState<boolean>(true)

  // ingreso de compra
  const [stores, setStores] = useState<{id:string; name:string; code:string}[]>([])
  const [storeId, setStoreId] = useState<string>('')
  const [buyProdId, setBuyProdId] = useState<string>('')
  const [buyQty, setBuyQty] = useState<number>(0)
  const [buyCost, setBuyCost] = useState<number>(0)

  const load = async () => {
    setError(null); setLoading(true)
    const { data, error } = await supabase
      .from('v_inventory')
      .select('product_id,name,sku,barcode,price,store_id,store_name,qty')
      .order('name', { ascending: true })
    if (error) setError(error.message)
    setRows(data || [])
    setLoading(false)
  }

  const loadStores = async () => {
    const { data } = await supabase.from('stores').select('id,name,code').order('name')
    setStores(data || [])
    if (data && data.length && !storeId) setStoreId(data[0].id)
  }

  useEffect(() => { load(); loadStores() }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, {name:string; sku:string|null; barcode:string|null; price:number|null; active?:boolean; lines:{store_name:string; qty:number}[] }>()
    rows.forEach(r => {
      const g = map.get(r.product_id) || { name:r.name, sku:r.sku, barcode:r.barcode, price:r.price, lines:[] }
      g.lines.push({ store_name: r.store_name, qty: r.qty })
      map.set(r.product_id, g)
    })
    return Array.from(map.entries()) // [product_id, data]
  }, [rows])

  const createProduct = async () => {
    if (!name.trim()) return alert('Nombre requerido')
    const { error } = await supabase.from('products').insert({
      name,
      sku: sku || null,
      barcode: barcode || null,
      price: price || 0
    })
    if (error) return alert('Error: ' + error.message)
    setName(''); setSku(''); setBarcode(''); setPrice(0)
    await load()
    alert('Producto creado ✔️')
  }

  const startEdit = (id:string, currentPrice:number|null) => {
    setEditId(id)
    setEditPrice(Number(currentPrice || 0))
  }

  const saveEdit = async () => {
    if (!editId) return
    const { error } = await supabase.from('products')
      .update({ price: editPrice })
      .eq('id', editId)
    if (error) return alert('Error: ' + error.message)
    setEditId(null)
    await load()
  }

  const registerPurchase = async () => {
    if (!storeId) return alert('Elegí sucursal')
    if (!buyProdId) return alert('Elegí producto')
    if (buyQty <= 0) return alert('Cantidad > 0')
    if (buyCost < 0) return alert('Costo >= 0')

    // 1) compra
    const { data: sale, error: e1 } = await supabase
      .from('purchases')
      .insert({ store_id: storeId, total: buyQty * buyCost })
      .select()
      .single()
    if (e1 || !sale) return alert('Error creando compra: ' + (e1?.message || ''))

    // 2) items compra (trigger suma stock)
    const { error: e2 } = await supabase.from('purchase_items').insert({
      purchase_id: sale.id,
      product_id: buyProdId,
      qty: buyQty,
      cost: buyCost
    })
    if (e2) return alert('Error creando ítem: ' + e2.message)

    setBuyQty(0); setBuyCost(0)
    await load()
    alert('Ingreso registrado ✔️. Stock actualizado.')
  }

  if (loading) return <div className="p-6">Cargando…</div>
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>

  return (
    <div className="p-6 grid gap-6">
      <h1 className="text-2xl font-bold">Inventario</h1>

      {/* Alta rápida */}
      <div className="rounded-xl border bg-white p-4 grid gap-3">
        <h2 className="font-semibold">Crear producto</h2>
        <div className="grid md:grid-cols-4 gap-3">
          <input className="border rounded px-3 py-2" placeholder="Nombre *" value={name} onChange={e=>setName(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="SKU" value={sku} onChange={e=>setSku(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="Código de barras" value={barcode} onChange={e=>setBarcode(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="Precio" type="number" value={price} onChange={e=>setPrice(Number(e.target.value))} />
        </div>
        <div className="flex gap-2">
          <button onClick={createProduct} className="rounded bg-black text-white px-4 py-2">Guardar</button>
          <button onClick={load} className="rounded border px-4 py-2">Refrescar</button>
        </div>
      </div>

      {/* Ingreso de stock (compra) */}
      <div className="rounded-xl border bg-white p-4 grid gap-3">
        <h2 className="font-semibold">Ingreso de stock (compra)</h2>
        <div className="grid md:grid-cols-5 gap-3">
          <select className="border rounded px-3 py-2" value={storeId} onChange={e=>setStoreId(e.target.value)}>
            <option value="">Sucursal…</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="border rounded px-3 py-2" value={buyProdId} onChange={e=>setBuyProdId(e.target.value)}>
            <option value="">Producto…</option>
            {grouped.map(([id, g]) => <option key={id} value={id}>{g.name}</option>)}
          </select>
          <input className="border rounded px-3 py-2" type="number" placeholder="Cantidad" value={buyQty} onChange={e=>setBuyQty(Number(e.target.value))} />
          <input className="border rounded px-3 py-2" type="number" placeholder="Costo unitario" value={buyCost} onChange={e=>setBuyCost(Number(e.target.value))} />
          <button onClick={registerPurchase} className="rounded bg-green-600 text-white px-4 py-2">Registrar ingreso</button>
        </div>
      </div>

      {/* Lista de productos con stock por sucursal */}
      <div className="rounded-xl border bg-white overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 text-left">Producto</th>
              <th>SKU</th>
              <th>Barcode</th>
              <th>Precio</th>
              <th className="text-left">Stock por sucursal</th>
              <th className="text-right pr-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([id, g]) => (
              <tr key={id} className="border-t">
                <td className="p-2">{g.name}</td>
                <td className="text-center">{g.sku || '-'}</td>
                <td className="text-center">{g.barcode || '-'}</td>
                <td className="text-center">
                  {editId===id ? (
                    <input className="border rounded px-2 py-1 w-28 text-right" type="number" value={editPrice} onChange={e=>setEditPrice(Number(e.target.value))} />
                  ) : (
                    <>${Number(g.price||0).toFixed(2)}</>
                  )}
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    {g.lines.map((l,idx)=>(
                      <span key={idx} className="text-xs border rounded px-2 py-1 bg-gray-50">
                        {l.store_name}: <b>{l.qty}</b>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="text-right pr-2">
                  {editId===id ? (
                    <div className="flex gap-2 justify-end">
                      <button onClick={saveEdit} className="border rounded px-2 py-1">Guardar</button>
                      <button onClick={()=>setEditId(null)} className="border rounded px-2 py-1">Cancelar</button>
                    </div>
                  ) : (
                    <button onClick={()=>startEdit(id, Number(g.price||0))} className="border rounded px-2 py-1">Editar</button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length===0 && <tr><td className="p-2" colSpan={6}>Sin productos</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <AuthGuard>
      <InventoryInner />
    </AuthGuard>
  )
}
