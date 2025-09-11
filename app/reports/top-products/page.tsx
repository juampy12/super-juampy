'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
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
type Row = {
  day: string
  store_id: string | null
  product_id: string
  sku: string
  name: string
  price: number
  units: number
  revenue: number
}

function toISOBoundary(d: Date, boundary: 'start'|'end') {
  const dt = boundary === 'start' ? startOfDay(d) : endOfDay(d)
  return dt.toISOString()
}

export default function TopProductsPage() {
  const today = new Date()

  const [stores, setStores] = useState<Store[]>([])
  const [storeId, setStoreId] = useState<string>('') // '' = Todas
  const [range, setRange] = useState<Range>({ from: startOfMonth(today), to: endOfMonth(today) })

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)

  const [metric, setMetric] = useState<'revenue'|'units'>('revenue')
  const [topN, setTopN] = useState(10)

  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('stores').select('id,name').order('name')
      setStores(data || [])
    })()
  }, [])

  const load = async () => {
    if (!range.from || !range.to) return
    setLoading(true)

    let q = supabase
      .from('v_sales_products')
      .select('day,store_id,product_id,sku,name,price,units,revenue')
      .gte('day', toISOBoundary(range.from, 'start'))
      .lte('day', toISOBoundary(range.to, 'end'))
      .order('fecha', { ascending: true })

    if (storeId) q = q.eq('store_id', storeId)

    const { data, error } = await q
    if (error) {
      setRows([])
    } else {
      const typed = (data as any[]).map(r => ({
        day: r.day,
        store_id: r.store_id ?? null,
        product_id: r.product_id,
        sku: r.sku,
        name: r.name,
        price: Number(r.price || 0),
        units: Number(r.units || 0),
        revenue: Number(r.revenue || 0),
      })) as Row[]
      setRows(typed)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [storeId, range.from?.toISOString(), range.to?.toISOString()])

  const perProduct = useMemo(() => {
    const m = new Map<string, {product_id:string; sku:string; name:string; price:number; units:number; revenue:number}>()
    for (const r of rows) {
      const cur = m.get(r.product_id) || { product_id: r.product_id, sku: r.sku, name: r.name, price: r.price, units: 0, revenue: 0 }
      cur.units   += r.units
      cur.revenue += r.revenue
      m.set(r.product_id, cur)
    }
    const arr = Array.from(m.values())
    arr.sort((a,b) => metric === 'revenue' ? b.revenue - a.revenue : b.units - a.units)
    return arr
  }, [rows, metric])

  const top = useMemo(() => perProduct.slice(0, Math.max(1, Math.min(50, topN))), [perProduct, topN])

  const chartData = useMemo(() => {
    return top.map(p => ({
      label: p.name.length > 40 ? p.name.slice(0, 37) + '�?�' : p.name,
      units: p.units,
      revenue: p.revenue,
    })).reverse()
  }, [top])

  const totalRevenue = perProduct.reduce((a,b) => a + b.revenue, 0)
  const totalUnits   = perProduct.reduce((a,b) => a + b.units, 0)

  // Export Excel
  const exportXLSX = () => {
    const sheetData = perProduct.map(p => ({
      SKU: p.sku, Producto: p.name, Unidades: p.units, Ingresos: p.revenue,
      'Precio ref.': p.price, 'Precio prom.': p.units ? p.revenue / p.units : 0
    }))
    const ws = utils.json_to_sheet(sheetData)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Top productos')
    writeFile(wb, `top_products_${format(range.from!, 'yyyyMMdd')}_${format(range.to!, 'yyyyMMdd')}${storeId ? '_store' : ''}.xlsx`)
  }

  // Export CSV amigable Excel
  const exportCSV = () => {
    const sep = ';'
    const header = ['sku','name','units','revenue','price_ref','avg_price'].join(sep)
    const lines = [header]
    for (const p of perProduct) {
      const avg = p.units ? (p.revenue / p.units) : 0
      const skuSafe = `="${String(p.sku).replace(/"/g,'""')}"`
      lines.push([
        skuSafe,
        `"${p.name.replace(/"/g,'""')}"`,
        String(p.units),
        String(p.revenue),
        String(p.price),
        avg.toFixed(2)
      ].join(sep))
    }
    const bom = '\uFEFF'
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `top_products_${format(range.from!, 'yyyyMMdd')}_${format(range.to!, 'yyyyMMdd')}${storeId ? '_store' : ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Export PDF (con captura del gráfico y tabla)
  const exportPDF = async () => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40

  // ------- Cabecera con LOGO -------
  let yTop = margin
  const logoW = 120
  const logoH = 60
  try {
    const logo = await toDataURL('/logo-super-juampy.png')
    doc.addImage(logo, 'PNG', margin, yTop, logoW, logoH)
  } catch (e) {
    alert('No se pudo cargar el logo desde /logo-super-juampy.png')
    console.warn(e)
  }

  const titleX = margin + logoW + 12
  let y = yTop + 12
  doc.setFontSize(16)
  doc.text('Top productos', titleX, y)
  y += 18
  doc.setFontSize(10)
  doc.text(`Rango: ${format(range.from!, 'dd/MM/yyyy')} �?' ${format(range.to!, 'dd/MM/yyyy')}`, titleX, y)
  y += 14
  doc.text(`Sucursal: ${storeId ? (stores.find(s=>s.id===storeId)?.name || storeId) : 'Todas'}`, titleX, y)
  y += 14
  doc.text(`Ingresos: $${totalRevenue.toFixed(2)}   �?�   Unidades: ${totalUnits}`, titleX, y)

  // Bajar por debajo del logo
  y = Math.max(yTop + logoH + 16, y + 16)

  // ------- Chart -------
  if (chartRef.current) {
    const canvas = await html2canvas(chartRef.current, { backgroundColor: '#ffffff', scale: 2 })
    const imgData = canvas.toDataURL('image/png')
    const imgW = pageWidth - margin * 2
    const imgH = (canvas.height * imgW) / canvas.width
    doc.addImage(imgData, 'PNG', margin, y, imgW, imgH)
    y += imgH + 16
  }

  // ------- Tabla (Top actual) -------
  const body = top.map(p => [
    p.sku,
    p.name,
    p.units,
    p.revenue.toFixed(2),
    p.price.toFixed(2),
    (p.units ? (p.revenue / p.units) : 0).toFixed(2),
  ])

  ;(autoTable as any)(doc, {
    startY: y,
    head: [['SKU','Producto','Unidades','Ingresos','Precio ref.','Precio prom.']],
    body,
    styles: { fontSize: 10 },
    margin: { left: margin, right: margin },
    headStyles: { fillColor: [0,0,0] },
  })

  doc.save(`top_products_${format(range.from!, 'yyyyMMdd')}_${format(range.to!, 'yyyyMMdd')}${storeId ? '_store' : ''}.pdf`)
}

  return (
    <main className="p-6 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Top productos</h1>

      <div className="grid gap-4 md:grid-cols-[auto,1fr]">
        {/* Panel izquierdo */}
        <div className="border rounded-2xl p-4 space-y-4">
          <div>
            <label className="block mb-1 font-medium">Sucursal</label>
            <select value={storeId} onChange={e=>setStoreId(e.target.value)} className="border rounded-xl p-2">
              <option value="">Todas</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
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
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm opacity-70">Métrica:</span>
            <button onClick={()=>setMetric('revenue')} className={`px-3 py-1 rounded border ${metric==='revenue'?'bg-black text-white':''}`}>Ingresos</button>
            <button onClick={()=>setMetric('units')}   className={`px-3 py-1 rounded border ${metric==='units'  ?'bg-black text-white':''}`}>Unidades</button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm opacity-70">Top N:</span>
            <input
              type="number" min={1} max={50} step={1}
              value={topN}
              onChange={e=>setTopN(Math.max(1, Math.min(50, Number(e.target.value))))}
              className="border rounded px-3 py-1 w-24"
            />
          </div>

          <div className="flex gap-2">
            <button onClick={exportPDF} className="px-3 py-2 rounded border">Exportar PDF</button>
            <button onClick={exportXLSX} className="px-3 py-2 rounded border">Exportar Excel (.xlsx)</button>
            <button onClick={exportCSV} className="px-3 py-2 rounded border">Exportar CSV</button>
          </div>
        </div>

        {/* Panel derecho */}
        <div className="space-y-4">
          <section className="grid grid-cols-3 gap-4">
            <div className="border rounded-2xl p-4">
              <div className="text-sm opacity-70">Ingresos (rango)</div>
              <div className="text-2xl font-bold">${totalRevenue.toFixed(2)}</div>
            </div>
            <div className="border rounded-2xl p-4">
              <div className="text-sm opacity-70">Unidades (rango)</div>
              <div className="text-2xl font-bold">{totalUnits}</div>
            </div>
            <div className="border rounded-2xl p-4">
              <div className="text-sm opacity-70">Productos con ventas</div>
              <div className="text-2xl font-bold">{perProduct.length}</div>
            </div>
          </section>

          <div className="border rounded-2xl p-4">
            <div className="text-sm mb-2 opacity-70">
              {loading ? 'Cargando�?�' : `Top ${top.length} por ${metric === 'revenue' ? 'Ingresos' : 'Unidades'}`}
            </div>
            <div ref={chartRef} style={{ width: '100%', height: 420 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} layout="vertical" margin={{ left: 24, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="label" width={220} />
                  <Tooltip />
                  <Bar dataKey={metric} name={metric === 'revenue' ? 'Ingresos' : 'Unidades'} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border rounded-2xl p-4 overflow-auto max-h-[60vh]">
            <table className="table">
              <thead>
                <tr className="text-left border-b">
                  <th>Producto</th><th>SKU</th><th>Unidades</th><th>Ingresos</th><th>Precio ref.</th>
                </tr>
              </thead>
              <tbody>
                {top.map(p => (
                  <tr key={p.product_id} className="border-b">
                    <td>{p.name}</td>
                    <td>{p.sku}</td>
                    <td>{p.units}</td>
                    <td>${p.revenue.toFixed(2)}</td>
                    <td>${p.price.toFixed(2)}</td>
                  </tr>
                ))}
                {top.length === 0 && !loading && (
                  <tr><td colSpan={5} className="py-6 text-center opacity-60">Sin datos en el rango seleccionado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  )
}




