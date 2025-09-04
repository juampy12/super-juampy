'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import AuthGuard from '../../components/AuthGuard'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts'

type Daily = { day: string; total: number }
type DailyStore = { day: string; store_id: string; total: number }
type Top = { product_id: string; name: string; units: number; revenue: number }
type Store = { id: string; name: string }

function ReportsInner() {
  const [stores, setStores] = useState<Store[]>([])
  const [storeId, setStoreId] = useState<string>('') // vacío = todas

  const [daily, setDaily] = useState<Daily[]>([])
  const [top, setTop] = useState<Top[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string|null>(null)

  // KPIs
  const [tickets, setTickets] = useState<number>(0)
  const [units, setUnits] = useState<number>(0)
  const [distinctProducts, setDistinctProducts] = useState<number>(0)

  // filtros (últimos 30 días)
  const today = new Date()
  const d30 = new Date(today); d30.setDate(today.getDate()-30)
  const [from, setFrom] = useState(d30.toISOString().slice(0,10))
  const [to, setTo] = useState(today.toISOString().slice(0,10))
  const [limitTop, setLimitTop] = useState(10)

  const loadStores = async () => {
    const { data } = await supabase.from('stores').select('id,name').order('name', {ascending:true})
    setStores(data || [])
  }

  const load = async () => {
    setLoading(true); setError(null)

    const f = new Date(from + 'T00:00:00')
    const t = new Date(to   + 'T23:59:59')

    // --- Ventas por día (según filtro de sucursal) ---
    if (storeId) {
      const { data: dSales, error: e1 } = await supabase
        .from('v_sales_daily_store')
        .select('day,store_id,total')
        .eq('store_id', storeId)
        .order('day', { ascending: true })
      if (e1) { setError(e1.message); setLoading(false); return }
      const filtered = (dSales || []).filter(r => {
        const d = new Date((r as DailyStore).day)
        return d >= f && d <= t
      }).map(r => ({ day: (r as DailyStore).day, total: (r as DailyStore).total })) as Daily[]
      setDaily(filtered)
    } else {
      const { data: dSales, error: e1 } = await supabase
        .from('v_sales_daily')
        .select('day,total')
        .order('day', { ascending: true })
      if (e1) { setError(e1.message); setLoading(false); return }
      const filtered = (dSales || []).filter(r => {
        const d = new Date((r as Daily).day)
        return d >= f && d <= t
      }) as Daily[]
      setDaily(filtered)
    }

    // --- Top productos (según sucursal) ---
    if (storeId) {
      const { data: dTop, error: eTop } = await supabase
        .from('v_top_products_store')
        .select('product_id,name,units,revenue,store_id')
        .eq('store_id', storeId)
        .order('revenue', { ascending: false })
      if (eTop) { setError(eTop.message); setLoading(false); return }
      setTop((dTop || []).slice(0, limitTop) as Top[])
    } else {
      const { data: dTop, error: eTop } = await supabase
        .from('v_top_products')
        .select('product_id,name,units,revenue')
        .order('revenue', { ascending: false })
      if (eTop) { setError(eTop.message); setLoading(false); return }
      setTop((dTop || []).slice(0, limitTop) as Top[])
    }

    // --- KPIs: tickets / unidades / productos distintos ---
    let qSales = supabase.from('sales').select('id', { count: 'exact', head: true })
      .gte('created_at', f.toISOString()).lte('created_at', t.toISOString())
    if (storeId) qSales = qSales.eq('store_id', storeId)
    const { count: salesCount } = await qSales
    setTickets(salesCount || 0)

    let qSalesList = supabase.from('sales').select('id')
      .gte('created_at', f.toISOString()).lte('created_at', t.toISOString())
    if (storeId) qSalesList = qSalesList.eq('store_id', storeId)
    const { data: salesInRange } = await qSalesList

    const saleIds = (salesInRange || []).map(s => s.id)
    if (saleIds.length > 0) {
      const { data: items } = await supabase
        .from('sale_items')
        .select('sale_id, product_id, qty')
        .in('sale_id', saleIds)
      if (items) {
        setUnits(items.reduce((acc, it) => acc + Number(it.qty || 0), 0))
        setDistinctProducts(new Set(items.map(it => it.product_id)).size)
      } else { setUnits(0); setDistinctProducts(0) }
    } else { setUnits(0); setDistinctProducts(0) }

    setLoading(false)
  }

  useEffect(() => { loadStores() }, [])
  useEffect(() => { load() }, []) // carga inicial
  useEffect(() => { load() }, [from, to, limitTop, storeId]) // recarga al cambiar filtros

  const totalPeriod = useMemo(
    () => daily.reduce((acc, r) => acc + (r.total || 0), 0),
    [daily]
  )
  const avgTicket = useMemo(
    () => tickets > 0 ? totalPeriod / tickets : 0,
    [totalPeriod, tickets]
  )

  if (loading) return <div className="p-6">Cargando…</div>
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>

  return (
    <div className="p-6 grid gap-6 text-gray-900">
      <h1 className="text-2xl font-bold">Reportes de ventas</h1>

      {/* Filtros */}
      <div className="rounded-xl border bg-white p-4 grid md:grid-cols-6 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="text-sm">Sucursal</label>
          <select className="border rounded px-3 py-2 w-full" value={storeId} onChange={e=>setStoreId(e.target.value)}>
            <option value="">Todas</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm">Desde</label>
          <input className="border rounded px-3 py-2 w-full" type="date" value={from} onChange={e=>setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-sm">Hasta</label>
          <input className="border rounded px-3 py-2 w-full" type="date" value={to} onChange={e=>setTo(e.target.value)} />
        </div>
        <div>
          <label className="text-sm">Top productos</label>
          <input className="border rounded px-3 py-2 w-full" type="number" min={3} max={50} value={limitTop} onChange={e=>setLimitTop(Number(e.target.value))} />
        </div>
        <div>
          <div className="text-sm text-gray-600">Total del período</div>
          <div className="text-2xl font-bold">${totalPeriod.toFixed(2)}</div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-sm text-gray-600">Tickets</div>
          <div className="text-2xl font-bold">{tickets}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-sm text-gray-600">Ticket promedio</div>
          <div className="text-2xl font-bold">${avgTicket.toFixed(2)}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-sm text-gray-600">Unidades vendidas</div>
          <div className="text-2xl font-bold">{units}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-sm text-gray-600">Productos distintos</div>
          <div className="text-2xl font-bold">{distinctProducts}</div>
        </div>
      </div>

      {/* Ventas por día */}
      <div className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold mb-3">Ventas por día {storeId ? '(Sucursal seleccionada)' : '(Todas)'}</h2>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top productos */}
      <div className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold mb-3">Top productos por facturación {storeId ? '(Sucursal seleccionada)' : '(Todas)'}</h2>
        <div style={{ width: '100%', height: 360 }}>
          <ResponsiveContainer>
            <BarChart data={top}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="revenue" />
              <Bar dataKey="units" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <AuthGuard>
      <ReportsInner />
    </AuthGuard>
  )
}
