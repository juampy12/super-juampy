'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import AuthGuard from '../../components/AuthGuard'
import clsx from 'clsx'

// TIP: si no tenés clsx, podés quitarlo o instalar con: npm i clsx

type InvRow = {
  product_id: string
  name: string
  sku: string | null
  barcode: string | null
  price: number | null
  active: boolean
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

  // edición inline
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSku, setEditSku] = useState('')
  const [editBarcode, setEditBarcode] = useState('')
  const [editPrice, setEditPrice] = useState<number>(0)

  // filtros
  const [q, setQ] = useState('')
  const [onlyActive, setOnlyActive] = useState(true)

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
      .select('product_id,name,sku,barcode,price,active,store_id,store_name,qty')
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

  // Agrupar por producto (con líneas por sucursal)
  const grouped = useMemo(() => {
    const map = new Map<string, {name:string; sku:string|null; barcode:string|null; price:number|null; active:boolean; lines:{store_name:string; qty:number}[] }>()
    rows.forEach(r => {
      const g = map.get(r.product_id) || { name:r.name, sku:r.sku, barcode:r.barcode, price:r.price, active:r.active, lines:[] }
      g.lines.push({ store_name: r.store_name, qty: r.qty })
      map.set(r.product_id, g)
    })
    // aplicar filtros
    let arr = Array.from(map.entries())
    if (q.trim()) {
      const qq = q.toLowerCase()
      arr = arr.filter(([_, g]) =>
        (g.name?.toLowerCase().includes(qq)) ||
        (g.sku?.toLowerCase().includes(qq)) ||
        (g.barcode?.toLowerCase().includes(qq))
      )
    }
    if (onlyActive) arr = arr.filter(([_, g]) => g.active)
    return arr
  }, [rows, q, onlyActive])

  // --- Alta rápida ---
  const createProduct = async () => {
    if (!name.trim()) return alert('Nombre requerido')
    const { error } = await supabase.from('products').insert({
      name,
      sku: sku || null,
      barcode: barcode || null,
      price: price || 0,
      active: true,
    })
    if (error) return alert('Error: ' + error.message)
    setName(''); setSku(''); setBarcode(''); setPrice(0)
    await load()
    alert('Producto creado ✔️')
  }

  // --- Edición ---
  const startEdit = (id:string, g:{name:string; sku:string|null; barcode:string|null; price:number|null}) => {
    setEditId(id)
    setEditName(g.name || '')
    setEditSku(g.sku || '')
    setEditBarcode(g.barcode || '')
    setEditPrice(Number(g.price || 0))
  }

  const saveEdit = async () => {
    if (!editId) return
    const { error } = await supabase.from('products')
      .update({ name: editName.trim(), sku: editSku || null, barcode: editBarcode || null, price: editPrice })
      .eq('id', editId)
    if (error) return alert('Error: ' + error.message)
    setEditId(null)
    await load()
  }

  const toggleActive = async (id:string, newVal:boolean) => {
    const { error } = await supabase.from('products')
      .update({ active: newVal })
      .eq('id', id)
    if (error) return alert('Error: ' + error.message)
    await load()
  }

  // --- Compras (ingreso de stock) ---
  const registerPurchase = async () => {
    if (!storeId) return alert('Elegí sucursal')
    if (!buyProdId) return alert('Elegí producto')
    if (buyQty <= 0) return alert('Cantidad > 0')
    if (buyCost < 0) return alert('Costo >= 0')

    const { data: purchase, error: e1 } = await supabase
      .from('purchases')
      .insert({ store_id: storeId, total: buyQty * buyCost })
      .select()
      .single()
    if (e1 || !purchase) return alert('Error creando compra: ' + (e1?.message || ''))

    const { error: e2 } = await supabase.from('purchase_items').insert({
      purchase_id: purchase.id,
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
    <div className="p-6 grid gap-6 text-gray-900">
      <h1 className="text-2xl font-bold">Inventario</h1>

      {/* Barra de búsqueda y filtro */}
      <div className="rounded-xl border bg-white p-4 flex flex-wrap gap-3 items-center">
        <input
          className="border rounded px-3 py-2 w-64"
          placeholder="Buscar (nombre, SKU, código)"
          value={q}
          onChange={e=>setQ(e.target.value)}
        />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={onlyActive} onChange={e=>setOnlyActive(e.target.checked)} />
          Solo activos
        </label>
        <button onClick={load} className="border rounded px-3 py-2">Refrescar</button>
      </div>

      {/* Alta rápida */}
      <div className="rounded-xl border bg-white p-4 grid gap-3">
        <h2 className="font-semibold text-gray-900">Crear producto</h2>
        <div className="grid md:grid-cols-5 gap-3">
          <input className="border rounded px-3 py-2" placeholder="Nombre *" value={name} onChange={e=>setName(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="SKU" value={sku} onChange={e=>setSku(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="Código de barras" value={barcode} onChange={e=>setBarcode(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="Precio" type="number" value={price} onChange={e=>setPrice(Number(e.target.value))} />
          <button onClick={createProduct} className="rounded bg-black text-white px-4 py-2">Guardar</button>
        </div>
      </div>

      {/* Ingreso de stock */}
      <div className="rounded-xl border bg-white p-4 grid gap-3">
        <h2 className="font-semibold text-gray-900">Ingreso de stock (compra)</h2>
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

      {/* Lista */}
      <div className="rounded-xl border bg-white overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 text-left">Producto</th>
              <th>SKU</th>
              <th>Barcode</th>
              <th>Precio</th>
              <th>Estado</th>
              <th className="text-left">Stock por sucursal</th>
              <th className="text-right pr-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([id, g]) => (
              <tr key={id} className="border-t">
                <td className="p-2">
                  {editId===id ? (
                    <input className="border rounded px-2 py-1 w-56" value={editName} onChange={e=>setEditName(e.target.value)} />
                  ) : g.name}
                </td>
                <td className="text-center">
                  {editId===id ? (
                    <input className="border rounded px-2 py-1 w-28 text-center" value={editSku} onChange={e=>setEditSku(e.target.value)} />
                  ) : (g.sku || '-')}
                </td>
                <td className="text-center">
                  {editId===id ? (
                    <input className="border rounded px-2 py-1 w-36 text-center" value={editBarcode} onChange={e=>setEditBarcode(e.target.value)} />
                  ) : (g.barcode || '-')}
                </td>
                <td className="text-center">
                  {editId===id ? (
                    <input className="border rounded px-2 py-1 w-28 text-right" type="number" value={editPrice} onChange={e=>setEditPrice(Number(e.target.value))} />
                  ) : <>${Number(g.price||0).toFixed(2)}</>}
                </td>
                <td className="text-center">
                  <span className={clsx("text-xs px-2 py-1 rounded border", g.active ? "bg-green-50 border-green-300 text-green-700" : "bg-gray-100 border-gray-300 text-gray-600")}>
                    {g.active ? "Activo" : "Inactivo"}
                  </span>
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
                    <div className="flex gap-2 justify-end">
                      <button onClick={()=>startEdit(id, g)} className="border rounded px-2 py-1">Editar</button>
                      <button onClick={()=>toggleActive(id, !g.active)} className={clsx("rounded px-2 py-1 border", g.active ? "bg-red-50 border-red-300 text-red-700" : "bg-green-50 border-green-300 text-green-700")}>
                        {g.active ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {grouped.length===0 && <tr><td className="p-2" colSpan={7}>Sin resultados</td></tr>}
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
