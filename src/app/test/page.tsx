'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

type Product = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  price: number | null
}

export default function TestPage() {
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id,name,sku,barcode,price')
        .order('created_at', { ascending: false })

      if (error) {
        setError(error.message)
      } else {
        setItems(data || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="p-6">Cargando…</div>
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Productos (prueba)</h1>
      <div className="rounded-xl border bg-white overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 text-left">Nombre</th>
              <th>SKU</th>
              <th>Barcode</th>
              <th className="text-right pr-2">Precio</th>
            </tr>
          </thead>
          <tbody>
            {items.map(p => (
              <tr key={p.id} className="border-t">
                <td className="p-2">{p.name}</td>
                <td>{p.sku || '-'}</td>
                <td>{p.barcode || '-'}</td>
                <td className="text-right pr-2">
                  ${Number(p.price || 0).toFixed(2)}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td className="p-2" colSpan={4}>Sin productos</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
