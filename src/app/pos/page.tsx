'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import AuthGuard from '../../components/AuthGuard'


type Store = { id: string; name: string; code: string }
type Product = { id: string; name: string; price: number | null; barcode: string | null }
type CartItem = { product_id: string; name: string; price: number; qty: number }

export default function POSPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [storeId, setStoreId] = useState<string>('')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const total = useMemo(() => cart.reduce((s,i)=> s + i.price * i.qty, 0), [cart])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('id,name,code')
        .order('name',{ascending:true})
      if (!error && data) {
        setStores(data)
        setStoreId(data[0]?.id || '')
      }
    })()
  }, [])

  const search = async () => {
    setErr(null); setMsg(null)
    const { data, error } = await supabase
      .from('products')
      .select('id,name,price,barcode')
      .or(`name.ilike.%${query}%,barcode.eq.${query}`)
      .limit(20)
    if (error) setErr(error.message)
    setResults(data || [])
  }

  const add = (p: Product) => {
    if (!p.id) return
    const price = Number(p.price || 0)
    setCart((old) => {
      const ex = old.find(i => i.product_id === p.id)
      if (ex) return old.map(i => i.product_id===p.id ? {...i, qty: i.qty+1} : i)
      return [...old, { product_id: p.id, name: p.name, price, qty: 1 }]
    })
  }

  const changeQty = (id:string, d:number) => {
    setCart(old => old.map(i => i.product_id===id ? {...i, qty: Math.max(1, i.qty + d)} : i))
  }
  const remove = (id:string) => setCart(old => old.filter(i => i.product_id !== id))

  const checkout = async () => {
    setErr(null); setMsg(null)
    if (!storeId) return setErr('Elegí una sucursal.')
    if (cart.length === 0) return setErr('El carrito está vacío.')

    setBusy(true)
    try {
      // 1) crear venta
      const { data: sale, error: e1 } = await supabase
        .from('sales')
        .insert({ store_id: storeId, total })
        .select()
        .single()
      if (e1 || !sale) throw new Error(e1?.message || 'No se pudo crear la venta.')

      // 2) insertar items
      const items = cart.map(i => ({
        sale_id: sale.id,
        product_id: i.product_id,
        qty: i.qty,
        price: i.price
      }))
      const { error: e2 } = await supabase.from('sale_items').insert(items)
      if (e2) throw new Error(e2.message)

      // 3) listo
      setCart([])
      setResults([])
      setQuery('')
      setMsg('Venta registrada ✔️. Se descontó el stock automáticamente.')
    } catch (e:any) {
      setErr(e.message || 'Error al cobrar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-6 grid gap-4">
      <h1 className="text-2xl font-bold">POS — Caja</h1>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-400">Sucursal:</label>
        <select
          className="border rounded px-2 py-1"
          value={storeId}
          onChange={(e)=>setStoreId(e.target.value)}
        >
          {stores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
        </select>
      </div>

      <div className="flex gap-2">
        <input
          className="border rounded px-3 py-2 flex-1"
          placeholder="Buscar por nombre o escanear código de barras"
          value={query}
          onChange={(e)=>setQuery(e.target.value)}
          onKeyDown={(e)=> e.key==='Enter' && search()}
        />
        <button onClick={search} className="rounded bg-black text-white px-4 py-2">Buscar</button>
      </div>

      {err && <div className="text-red-600">{err}</div>}
      {msg && <div className="text-green-600">{msg}</div>}

      <div className="grid md:grid-cols-2 gap-4">
        {/* resultados */}
        <div className="rounded-xl border bg-white p-2">
          <h2 className="font-semibold mb-2">Resultados</h2>
          <ul className="divide-y">
            {results.map(p => (
              <li key={p.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-gray-500">Precio: ${Number(p.price||0).toFixed(2)} | {p.barcode || '-'}</div>
                </div>
                <button onClick={()=>add(p)} className="border rounded px-2 py-1">Agregar</button>
              </li>
            ))}
            {results.length===0 && <li className="text-sm text-gray-500 py-2">Sin resultados</li>}
          </ul>
        </div>

        {/* carrito */}
        <div className="rounded-xl border bg-white p-2">
          <h2 className="font-semibold mb-2">Carrito</h2>
          <ul className="divide-y">
            {cart.map(i => (
              <li key={i.product_id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs text-gray-500">{i.qty} x ${i.price.toFixed(2)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="border rounded px-2" onClick={()=>changeQty(i.product_id,-1)}>-</button>
                  <button className="border rounded px-2" onClick={()=>changeQty(i.product_id,1)}>+</button>
                  <button className="border rounded px-2" onClick={()=>remove(i.product_id)}>Quitar</button>
                </div>
              </li>
            ))}
            {cart.length===0 && <li className="text-sm text-gray-500 py-2">Carrito vacío</li>}
          </ul>
          <div className="flex items-center justify-between mt-3">
            <div className="font-bold">Total: ${total.toFixed(2)}</div>
            <button
              onClick={checkout}
              disabled={busy || cart.length===0}
              className="rounded bg-green-600 text-white px-4 py-2 disabled:opacity-50"
            >
              {busy ? 'Cobrando...' : 'Cobrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
