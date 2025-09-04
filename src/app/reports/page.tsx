'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

type Store = { id: string; name: string }
type AnyRow = Record<string, any>

type Daily = {
  date: string       // YYYY-MM-DD
  tickets: number
  units: number
  total: number
}

function mapDailyRow(r: AnyRow): Daily {
  // Intento robusto por si tu vista tiene nombres levemente distintos
  const date =
    r.date || r.day || r.d || r.fecha || r.f || r.sale_date || r.created_at || ''

  const tickets =
    (r.tickets ?? r.orders ?? r.count ?? r.cant_tickets ?? r.qty_tickets ?? 0) * 1

  const units =
    (r.units ?? r.items ?? r.qty ?? r.cant_items ?? r.total_units ?? 0) * 1

  const total =
    Number(
      r.total ?? r.amount ?? r.sum ?? r.total_amount ?? r.importe_total ?? 0
    ) || 0

  // Normalizo date en formato YYYY-MM-DD
  const d = date ? new Date(date) : new Date()
  const iso = isNaN(d.getTime()) ? String(date) : d.toISOString().slice(0, 10)

  return { date: iso, tickets, units, total }
}

export default function ReportsPage() {
  // filtros
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const todayStr = `${yyyy}-${mm}-${dd}`

  const [from, setFrom] = useState(todayStr)
  const [to, setTo] = useState(todayStr)
  const [store, setStore] = useState<string>('') // vacío = todas

  // datos
  const [stores, setStores] = useState<Store[]>([])
  const [rows, setRows] = useState<Daily[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    // sucursales
    supabase.from('stores').select('id,name').order('name').then(({ data, error }) => {
      if (!error && data) setStores(data as Store[])
    })
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      // Vista creada antes: v_sales_daily
      let query = supabase.from('v_sales_daily').select('*').order('date', { ascending: true })
      if (from) query = query.gte('date', from)
      if (to) query = query.lte('date', to)
      if (store) query = query.eq('store_id', store)

      const { data, error } = await query
      if (error) throw error
      const mapped = (data || []).map(mapDailyRow)
      setRows(mapped)
    } catch (e: any) {
      setError(e.message ?? 'Error cargando reportes')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* carga inicial */ }, [])

  const kpi = useMemo(() => {
    const tickets = rows.reduce((a, r) => a + (r.tickets || 0), 0)
    const units   = rows.reduce((a, r) => a + (r.units   || 0), 0)
    const total   = rows.reduce((a, r) => a + (r.total   || 0), 0)
    const avg     = tickets ? total / tickets : 0
    return { tickets, units, total, avg }
  }, [rows])

  const exportCSV = () => {
    const head = ['fecha', 'tickets', 'unidades', 'total']
    const body = rows.map(r => [r.date, r.tickets, r.units, r.total.toFixed(2)])
    const csv = [head, ...body].map(line => line.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ventas_${from}_a_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const setToday = () => {
    setFrom(todayStr)
    setTo(todayStr)
  }

  return (
    <>
      <h1>Reportes</h1>

      {/* FILTROS */}
      <section className="section card">
        <h2>Filtros</h2>
        <div className="toolbar" style={{ gap: 12 }}>
          <div>
            <label style={{ display:'block', fontSize:12, color:'#6b7280' }}>Desde</label>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} />
          </div>
          <div>
            <label style={{ display:'block', fontSize:12, color:'#6b7280' }}>Hasta</label>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)} />
          </div>
          <div style={{ minWidth:240 }}>
            <label style={{ display:'block', fontSize:12, color:'#6b7280' }}>Sucursal</label>
            <select value={store} onChange={e=>setStore(e.target.value)}>
              <option value="">Todas</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            {loading ? 'Cargando…' : 'Aplicar'}
          </button>
          <button className="btn btn-outline" onClick={setToday}>Hoy</button>
          <button className="btn btn-warning" onClick={exportCSV} disabled={!rows.length}>Exportar CSV</button>
        </div>
        {error && <p style={{ color:'#b91c1c', marginTop:10 }}>⚠️ {error}</p>}
      </section>

      {/* KPIs */}
      <section className="section card grid-2" style={{ gridTemplateColumns:'repeat(4,1fr)' }}>
        <div className="card" style={{ padding:14 }}>
          <div style={{ fontSize:12, color:'#6b7280' }}>Total vendido</div>
          <div style={{ fontSize:24, fontWeight:700 }}>${kpi.total.toFixed(2)}</div>
        </div>
        <div className="card" style={{ padding:14 }}>
          <div style={{ fontSize:12, color:'#6b7280' }}>Tickets</div>
          <div style={{ fontSize:24, fontWeight:700 }}>{kpi.tickets}</div>
        </div>
        <div className="card" style={{ padding:14 }}>
          <div style={{ fontSize:12, color:'#6b7280' }}>Ticket promedio</div>
          <div style={{ fontSize:24, fontWeight:700 }}>${kpi.avg.toFixed(2)}</div>
        </div>
        <div className="card" style={{ padding:14 }}>
          <div style={{ fontSize:12, color:'#6b7280' }}>Unidades</div>
          <div style={{ fontSize:24, fontWeight:700 }}>{kpi.units}</div>
        </div>
      </section>

      {/* TABLA POR DÍA */}
      <section className="section card">
        <h2>Ventas por día</h2>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tickets</th>
              <th>Unidades</th>
              <th>Total</th>
              <th>Promedio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const avg = r.tickets ? r.total / r.tickets : 0
              return (
                <tr key={r.date}>
                  <td>{r.date}</td>
                  <td>{r.tickets}</td>
                  <td>{r.units}</td>
                  <td>${r.total.toFixed(2)}</td>
                  <td>${avg.toFixed(2)}</td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr>
                <td colSpan={5} style={{ color:'#6b7280' }}>Sin resultados para el filtro.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  )
}
