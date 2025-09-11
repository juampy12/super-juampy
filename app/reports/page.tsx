'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  format,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { utils, writeFile } from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'

// --- helper: convierte /public/archivo.png a dataURL (para insertar imagen en PDF)
async function toDataURL(path: string): Promise<string> {
  const res = await fetch(path)
  const blob = await res.blob()
  return await new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}
// --- fin helper

type Range = { from?: Date; to?: Date }
type Store = { id: string; name: string }
type Row = { day: string; tickets: number; revenue: number; store_id: string | null }

function toISOBoundary(d: Date, boundary: 'start' | 'end') {
  const dt = boundary === 'start' ? startOfDay(d) : endOfDay(d)
  return dt.toISOString()
}

export default function ReportsPage() {
  const today = new Date()

  // ===== Sucursales =====
  const [stores, setStores] = useState<Store[]>([])
  const [storeId, setStoreId] = useState<string>('') // '' = Todas
  const [storesErr, setStoresErr] = useState<string>('')

  // ===== Calendario =====
  const [range, setRange] = useState<Range>({ from: startOfMonth(today), to: endOfMonth(today) })

  // ===== Datos =====
  const [rowsFiltered, setRowsFiltered] = useState<Row[]>([])
  const [rowsAll, setRowsAll] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)

  // ===== UI comparativo =====
  const [compareMode, setCompareMode] = useState(false)
  const [compareMetric, setCompareMetric] = useState<'revenue' | 'tickets'>('revenue')

  // ===== Ref para capturar el chart al PDF =====
  const chartRef = useRef<HTMLDivElement>(null)

  // Sucursales
  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase.from('stores').select('id,name').order('name')
      if (error) { setStoresErr(error.message); setStores([]); return }
      setStores(data || [])
    })()
  }, [])

  // Datos (filtro actual)
  const loadFiltered = async () => {
    if (!range.from || !range.to) return
    setLoading(true)
    let query = supabase
      .from('v_resumen_diario_mv')
      .select('day,tickets,revenue,store_id')
      .gte('day', toISOBoundary(range.from, 'start'))
      .lte('day', toISOBoundary(range.to, 'end'))
      .order('fecha', { ascending: true })
    if (storeId) query = query.eq('store_id', storeId)
    const { data, error } = await query
    if (!error && data) {
      setRowsFiltered(
        (data as any[]).map(r => ({
          day: r.day,
          tickets: Number(r.tickets || 0),
          revenue: Number(r.revenue || 0),
          store_id: r.store_id ?? null,
        }))
      )
    } else {
      setRowsFiltered([])
    }
    setLoading(false)
  }

  // Datos (todas las sucursales) para comparativo
  const loadAllForCompare = async () => {
    if (!range.from || !range.to) return
    const { data, error } = await supabase
      .from('v_resumen_diario_mv')
      .select('day,tickets,revenue,store_id')
      .gte('day', toISOBoundary(range.from, 'start'))
      .lte('day', toISOBoundary(range.to, 'end'))
      .order('fecha', { ascending: true })
    if (!error && data) {
      setRowsAll(
        (data as any[]).map(r => ({
          day: r.day,
          tickets: Number(r.tickets || 0),
          revenue: Number(r.revenue || 0),
          store_id: r.store_id ?? null,
        }))
      )
    } else {
      setRowsAll([])
    }
  }

  useEffect(() => { loadFiltered() }, [storeId, range.from?.toISOString(), range.to?.toISOString()])
  useEffect(() => { loadAllForCompare() }, [range.from?.toISOString(), range.to?.toISOString()])

  // Agregado diario cuando no hay filtro de sucursal
  const aggregatedByDay = useMemo(() => {
    if (storeId) return rowsFiltered
    const map = new Map<string, { day: string; tickets: number; revenue: number; store_id: null }>()
    for (const r of rowsFiltered) {
      const key = r.day
      const cur = map.get(key) || { day: r.day, tickets: 0, revenue: 0, store_id: null }
      cur.tickets += r.tickets
      cur.revenue += r.revenue
      map.set(key, cur)
    }
    return Array.from(map.values()).sort((a, b) => +new Date(a.day) - +new Date(b.day))
  }, [rowsFiltered, storeId])

  // Chart main
  const chartDataMain = useMemo(
    () =>
      aggregatedByDay.map(r => ({
        dayLabel: format(new Date(r.day), 'dd MMM', { locale: es }),
        tickets: r.tickets,
        revenue: r.revenue,
      })),
    [aggregatedByDay]
  )

  // Comparativo
  const storesById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of stores) m.set(s.id, s.name)
    return m
  }, [stores])

  const compareDays = useMemo(() => {
    const set = new Set<string>()
    for (const r of rowsAll) set.add(r.day)
    return Array.from(set).sort((a, b) => +new Date(a) - +new Date(b))
  }, [rowsAll])

  const storesToShow = useMemo(() => stores, [stores])

  const compareData = useMemo(() => {
    const byDay: Record<string, any> = {}
    for (const day of compareDays) byDay[day] = { dayLabel: format(new Date(day), 'dd MMM', { locale: es }) }
    for (const r of rowsAll) {
      if (!r.store_id) continue
      const storeName = storesById.get(r.store_id) || r.store_id
      const key = compareMetric
      byDay[r.day][storeName] = (byDay[r.day][storeName] || 0) + (r as any)[key]
    }
    return compareDays.map(d => byDay[d])
  }, [rowsAll, compareDays, storesById, compareMetric])

  // KPIs
  const kpiRows = aggregatedByDay
  const totalRevenue = kpiRows.reduce((a, b) => a + b.revenue, 0)
  const totalTickets = kpiRows.reduce((a, b) => a + b.tickets, 0)
  const avgTicket = totalTickets ? totalRevenue / totalTickets : 0

  // Atajos rango
  const setToday = () => setRange({ from: today, to: today })
  const setThisMonth = () => setRange({ from: startOfMonth(today), to: endOfMonth(today) })
  const setThisYear = () => setRange({ from: startOfYear(today), to: endOfYear(today) })

  // ===== Exportar Excel =====
  const exportXLSX = () => {
    const src = compareMode ? rowsAll : rowsFiltered
    const sheetData = src.map(r => ({
      Fecha: format(new Date(r.day), 'yyyy-MM-dd'),
      Sucursal: r.store_id ? (storesById.get(r.store_id) || r.store_id) : (storeId ? '�?"' : 'Todas'),
      Tickets: r.tickets,
      Ingresos: r.revenue,
    }))
    const ws = utils.json_to_sheet(sheetData)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Ventas')
    const name = `ventas_${format(range.from!, 'yyyyMMdd')}_${format(range.to!, 'yyyyMMdd')}${compareMode ? '_comparativo' : ''}.xlsx`
    writeFile(wb, name)
  }

  // ===== Exportar CSV amigable Excel =====
  const exportCSV = () => {
    const src = compareMode ? rowsAll : rowsFiltered
    const sep = ';'
    const header = ['date', 'store', 'tickets', 'revenue'].join(sep)
    const lines = [header]
    for (const r of src) {
      const date = format(new Date(r.day), 'yyyy-MM-dd')
      const storeName = r.store_id ? (storesById.get(r.store_id) || r.store_id) : (storeId ? '�?"' : 'Todas')
      const row = [
        `"${date}"`,
        `"${String(storeName).replace(/"/g, '""')}"`,
        String(r.tickets),
        String(r.revenue),
      ].join(sep)
      lines.push(row)
    }
    const bom = '\uFEFF'
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ventas_${format(range.from!, 'yyyyMMdd')}_${format(range.to!, 'yyyyMMdd')}${compareMode ? '_comparativo' : ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ===== Exportar PDF =====
  const exportPDF = async () => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40

  // ------- Cabecera con LOGO -------
  let yTop = margin
  const logoW = 120
  const logoH = 60
  try {
    const logo = await toDataURL('/logo-super-juampy.png') // <- archivo en /public
    doc.addImage(logo, 'PNG', margin, yTop, logoW, logoH)
  } catch (e) {
    alert('No se pudo cargar el logo desde /logo-super-juampy.png')
    console.warn(e)
  }

  const titleX = margin + logoW + 12
  let y = yTop + 12
  doc.setFontSize(16)
  doc.text('Reporte de ventas', titleX, y)
  y += 18
  doc.setFontSize(10)
  doc.text(`Rango: ${format(range.from!, 'dd/MM/yyyy')} �?' ${format(range.to!, 'dd/MM/yyyy')}`, titleX, y)
  y += 14
  const storeLabel = compareMode ? 'Todas (comparativo)' : (storeId ? (stores.find(s => s.id === storeId)?.name || storeId) : 'Todas')
  doc.text(`Sucursal: ${storeLabel}`, titleX, y)
  y += 14
  doc.text(`Ingresos: $${totalRevenue.toFixed(2)}   �?�   Tickets: ${totalTickets}   �?�   Ticket Prom.: $${avgTicket.toFixed(2)}`, titleX, y)

  // Bajar por debajo del logo
  y = Math.max(yTop + logoH + 16, y + 16)

  // ------- Chart (captura del div con ref) -------
  if (chartRef.current) {
    const canvas = await html2canvas(chartRef.current, { backgroundColor: '#ffffff', scale: 2 })
    const imgData = canvas.toDataURL('image/png')
    const imgW = pageWidth - margin * 2
    const imgH = (canvas.height * imgW) / canvas.width
    doc.addImage(imgData, 'PNG', margin, y, imgW, imgH)
    y += imgH + 16
  }

  // ------- Tabla -------
  const src = compareMode ? rowsAll : rowsFiltered
  const storesById = new Map(stores.map(s => [s.id, s.name] as const))
  const body = src.map(r => [
    format(new Date(r.day), 'yyyy-MM-dd'),
    r.store_id ? (storesById.get(r.store_id) || r.store_id) : (storeId ? '�?"' : 'Todas'),
    r.tickets,
    r.revenue,
  ])

  ;(autoTable as any)(doc, {
    startY: y,
    head: [['Fecha', 'Sucursal', 'Tickets', 'Ingresos']],
    body,
    styles: { fontSize: 10 },
    margin: { left: margin, right: margin },
    headStyles: { fillColor: [0, 0, 0] },
  })

  doc.save(`ventas_${format(range.from!, 'yyyyMMdd')}_${format(range.to!, 'yyyyMMdd')}${compareMode ? '_comparativo' : ''}.pdf`)
}

  return (
    <main className="p-6 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Reportes de ventas</h1>

      <div className="grid gap-4 md:grid-cols-[auto,1fr]">
        {/* Panel izquierdo */}
        <div className="border rounded-2xl p-4">
          <label className="block mb-1 font-medium">Sucursal</label>
          {storesErr && <div className="mb-2 text-sm text-red-600">Error: {storesErr}</div>}
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="border rounded-xl p-2 mb-4"
            disabled={compareMode}
            title={compareMode ? 'Desactiva "Comparar" para filtrar por sucursal' : undefined}
          >
            <option value="">Todas</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <div className="text-sm opacity-70 mb-2">Elegí un rango</div>
          <DayPicker
            mode="range"
            selected={range}
            onSelect={setRange}
            locale={es}
            weekStartsOn={1}
            showOutsideDays
            numberOfMonths={2}
            captionLayout="buttons"
            footer={
              <div className="mt-2 text-sm">
                {range.from && range.to
                  ? `Rango: ${format(range.from, 'dd/MM/yyyy')} �?' ${format(range.to, 'dd/MM/yyyy')}`
                  : 'Seleccioná un rango (desde�?"hasta)'}
              </div>
            }
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={setToday} className="px-3 py-1 rounded border">Hoy</button>
            <button onClick={setThisMonth} className="px-3 py-1 rounded border">Este mes</button>
            <button onClick={setThisYear} className="px-3 py-1 rounded border">Año actual</button>
          </div>
        </div>

        {/* Panel derecho */}
        <div className="space-y-4">
          {/* Controles y export */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <input aria-label="campo6" id="input6" name="input6" type="checkbox" checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} />
              <span>Comparar sucursales (barras lado a lado)</span>
            </label>

            {compareMode && (
              <div className="flex items-center gap-2">
                <span className="text-sm opacity-70">Métrica:</span>
                <button onClick={() => setCompareMetric('revenue')} className={`px-3 py-1 rounded border ${compareMetric==='revenue' ? 'bg-black text-white' : ''}`}>Ingresos</button>
                <button onClick={() => setCompareMetric('tickets')} className={`px-3 py-1 rounded border ${compareMetric==='tickets' ? 'bg-black text-white' : ''}`}>Tickets</button>
              </div>
            )}

            <div className="ml-auto flex gap-2">
              <button onClick={exportPDF} className="px-3 py-2 rounded border">Exportar PDF</button>
              <button onClick={exportXLSX} className="px-3 py-2 rounded border">Exportar Excel (.xlsx)</button>
              <button onClick={exportCSV} className="px-3 py-2 rounded border">Exportar CSV</button>
            </div>
          </div>

          {/* KPIs */}
          <section className="grid grid-cols-3 gap-4">
            <div className="border rounded-2xl p-4">
              <div className="text-sm opacity-70">Ingresos (rango)</div>
              <div className="text-2xl font-bold">${totalRevenue.toFixed(2)}</div>
            </div>
            <div className="border rounded-2xl p-4">
              <div className="text-sm opacity-70">Tickets</div>
              <div className="text-2xl font-bold">{totalTickets}</div>
            </div>
            <div className="border rounded-2xl p-4">
              <div className="text-sm opacity-70">Ticket Promedio</div>
              <div className="text-2xl font-bold">${avgTicket.toFixed(2)}</div>
            </div>
          </section>

          {/* Chart (con ref para PDF) */}
          <div className="border rounded-2xl p-4">
            <div className="text-sm mb-2 opacity-70">
              {loading
                ? 'Cargando�?�'
                : range.from && range.to
                  ? !compareMode
                    ? `Ventas por día (${format(range.from, 'dd/MM/yyyy')} �?' ${format(range.to, 'dd/MM/yyyy')})${storeId ? '' : ' �?" (todas las sucursales)'}`
                    : `Comparativo por sucursal (${format(range.from, 'dd/MM/yyyy')} �?' ${format(range.to, 'dd/MM/yyyy')}) �?" ${compareMetric === 'revenue' ? 'Ingresos' : 'Tickets'}`
                  : 'Ventas por día'}
            </div>

            <div ref={chartRef} style={{ width: '100%', height: !compareMode ? 340 : 380 }}>
              <ResponsiveContainer>
                {!compareMode ? (
                  <ComposedChart data={chartDataMain}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="dayLabel" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Bar yAxisId="left" dataKey="tickets" name="Tickets" />
                    <Line yAxisId="right" type="monotone" dataKey="revenue" name="Ingresos" />
                  </ComposedChart>
                ) : (
                  <ComposedChart data={compareData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="dayLabel" />
                    <YAxis />
                    <Tooltip />
                    {storesToShow.map((s) => (
                      <Bar key={s.id} dataKey={s.name} name={s.name} />
                    ))}
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="border rounded-2xl p-4 overflow-auto max-h-[60vh]">
        <table className="table">
          <thead>
            <tr className="text-left border-b">
              <th>Fecha</th><th>Sucursal</th><th>Tickets</th><th>Ingresos</th>
            </tr>
          </thead>
          <tbody>
            {(rowsFiltered.length ? rowsFiltered : []).map((r) => (
              <tr key={`${r.day}-${r.store_id ?? 'all'}`} className="border-b">
                <td>{format(new Date(r.day), "dd/MM/yyyy", { locale: es })}</td>
                <td>{r.store_id ? (stores.find(s => s.id === r.store_id)?.name || r.store_id) : (storeId ? '�?"' : 'Todas')}</td>
                <td>{r.tickets}</td>
                <td>${r.revenue.toFixed(2)}</td>
              </tr>
            ))}
            {rowsFiltered.length === 0 && !loading && (
              <tr><td colSpan={4} className="py-6 text-center opacity-60">Sin datos en el rango seleccionado</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}






