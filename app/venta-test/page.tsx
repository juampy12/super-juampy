'use client';

import { useState } from 'react';
import { confirmarVenta } from '../../lib/sales';

export default function VentaTest() {
  const [storeId, setStoreId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState<number>(1);
  const [price, setPrice] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function onRun() {
    try {
      if (!storeId) throw new Error('Falta storeId');
      if (!productId) throw new Error('Falta productId');
      setLoading(true);
      const saleId = await confirmarVenta(storeId, [{ id: productId, qty, price }]);
      setResult(saleId);
    } catch (e: any) {
      setResult('ERROR: ' + (e.message ?? String(e)));
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 520 }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Prueba RPC: Confirmar Venta</h1>

      <label>storeId (UUID de stores.id)</label>
      <input value={storeId} onChange={e=>setStoreId(e.target.value)} placeholder="pegá el UUID de la sucursal" style={{ width:'100%', padding:8, margin:'6px 0 12px' }}/>

      <label>productId (UUID de products.id)</label>
      <input value={productId} onChange={e=>setProductId(e.target.value)} placeholder="pegá el UUID del producto" style={{ width:'100%', padding:8, margin:'6px 0 12px' }}/>

      <div style={{ display:'flex', gap:8 }}>
        <div style={{ flex:1 }}>
          <label>Cantidad</label>
          <input type="number" value={qty} onChange={e=>setQty(Number(e.target.value))} style={{ width:'100%', padding:8, margin:'6px 0 12px' }}/>
        </div>
        <div style={{ flex:1 }}>
          <label>Precio</label>
          <input type="number" value={price} onChange={e=>setPrice(Number(e.target.value))} style={{ width:'100%', padding:8, margin:'6px 0 12px' }}/>
        </div>
      </div>

      <button onClick={onRun} disabled={loading} style={{ padding:'10px 16px' }}>
        {loading ? 'Confirmando…' : 'Confirmar venta'}
      </button>

      {result && (
        <pre style={{ background:'#111', color:'#0f0', padding:12, marginTop:16, whiteSpace:'pre-wrap' }}>
{result}
        </pre>
      )}
    </div>
  );
}
