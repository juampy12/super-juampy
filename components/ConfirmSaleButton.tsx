"use client";
import { useRef, useState } from "react";
import { exportReceiptPDF } from "@/app/_utils/receipt";

type ConfirmItem = {
  product_id: string;
  name: string;
  qty: number;
  unit_price: number;
};

type PaymentBreakdown = {
  cash?: number;
  debit?: number;
  credit?: number;
  mp?: number;
  account?: number;
};

type PaymentInfo = {
  method: "efectivo" | "debito" | "credito" | "mp" | "cuenta_corriente" | "mixto";
  total_paid: number;
  change?: number;
  breakdown?: PaymentBreakdown;
  notes?: string;
};

type Props = {
  items: ConfirmItem[];
  total: number;
  payment?: PaymentInfo;
  onConfirmed?: () => void;
  storeId?: string | null;
  registerId?: string | null;
  storeName?: string | null;
};

export default function ConfirmSaleButton({ items, total, payment, onConfirmed, storeId, registerId, storeName }: Props) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [showTicket, setShowTicket] = useState(false);
  const inFlightRef = useRef(false);

  function handleClick() {
    if (inFlightRef.current) return;
    if (!items || items.length === 0) { alert("No hay productos en el carrito."); return; }
    if (!storeId) { alert("Falta sucursal. Elegí una sucursal antes de confirmar."); return; }
    if (!registerId) { alert("Falta caja. Elegí Caja 1 / Caja 2 antes de confirmar."); return; }
    if (!payment) { alert("Falta información de pago."); return; }
    if (payment.method === "efectivo" || payment.method === "mixto") {
      if (payment.total_paid < total) {
        alert(`El monto pagado ($${payment.total_paid}) es menor que el total ($${total}).`);
        return;
      }
    }
    setShowModal(true);
  }

  async function confirmar() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setShowModal(false);
    setLoading(true);
    try {
      const res = await fetch("/api/pos/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, total, payment, store_id: storeId, register_id: registerId }),
      });
      const json2 = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json2?.error ?? json2?.details ?? `HTTP ${res.status}`);
      }
      setLastSaleId(json2?.saleId ?? null);
      setShowTicket(true);
      onConfirmed?.();
    } catch (e: any) {
      alert("Error al confirmar: " + (e?.message ?? "desconocido"));
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }

  const methodLabel: Record<string, string> = {
    efectivo: "Efectivo", debito: "Débito", credito: "Crédito",
    mp: "Mercado Pago", cuenta_corriente: "Cuenta corriente", mixto: "Mixto",
  };

  async function imprimirTicket() {
    await exportReceiptPDF({
      saleId: lastSaleId ?? undefined,
      storeName: storeName ?? "Super Juampy",
      items: items.map(it => ({
        name: it.name,
        qty: it.qty,
        price: it.unit_price,
        subtotal: it.qty * it.unit_price,
      })),
      payMethod: payment?.method ?? "efectivo",
      amount: payment?.total_paid ?? 0,
      change: payment?.change ?? 0,
      total: total,
    });
    setShowTicket(false);
  }

  return (
    <>
      {showTicket && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#fff", borderRadius:16, padding:"24px 28px", maxWidth:320, width:"90%", textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
            <h2 style={{ fontSize:18, fontWeight:500, marginBottom:8 }}>Venta confirmada</h2>
            <p style={{ fontSize:14, color:"#666", marginBottom:20 }}>Total: ${total.toFixed(2)}</p>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setShowTicket(false)} style={{ flex:1, padding:"10px 0", borderRadius:8, border:"1px solid #ddd", background:"#fff", cursor:"pointer", fontSize:14 }}>
                Cerrar
              </button>
              <button onClick={imprimirTicket} style={{ flex:2, padding:"10px 0", borderRadius:8, border:"none", background:"#1d4ed8", color:"#fff", cursor:"pointer", fontSize:14, fontWeight:500 }}>
                🖨️ Imprimir ticket
              </button>
            </div>
          </div>
        </div>
      )}
      {showModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#fff", borderRadius:16, padding:"24px 28px", maxWidth:340, width:"90%", boxShadow:"0 8px 32px rgba(0,0,0,0.2)" }}>
            <h2 style={{ fontSize:18, fontWeight:500, marginBottom:16 }}>Confirmar venta</h2>
            <div style={{ fontSize:14, color:"#555", marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span>Total</span>
                <strong>${total.toFixed(2)}</strong>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span>Método</span>
                <span>{methodLabel[payment?.method ?? ""] ?? payment?.method}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span>Pagado</span>
                <span>${(payment?.total_paid ?? 0).toFixed(2)}</span>
              </div>
              {(payment?.change ?? 0) > 0 && (
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, color:"#059669", fontWeight:500 }}>
                  <span>Vuelto</span>
                  <span>${(payment?.change ?? 0).toFixed(2)}</span>
                </div>
              )}
            </div>
            <div style={{ display:"flex", gap:10, marginTop:20 }}>
              <button onClick={() => setShowModal(false)} style={{ flex:1, padding:"10px 0", borderRadius:8, border:"1px solid #ddd", background:"#fff", cursor:"pointer", fontSize:14 }}>
                Cancelar
              </button>
              <button onClick={confirmar} style={{ flex:2, padding:"10px 0", borderRadius:8, border:"none", background:"#16a34a", color:"#fff", cursor:"pointer", fontSize:14, fontWeight:500 }}>
                ✅ Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t shadow-[0_-6px_12px_-6px_rgba(0,0,0,0.3)]">
        <div className="max-w-4xl mx-auto p-4">
          <button
            type="button"
            data-pos-confirm="1"
            onClick={handleClick}
            disabled={loading || items.length === 0}
            className="w-full rounded-xl px-6 py-4 text-lg font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-xl"
          >
            {items.length === 0 ? "Agregá productos para confirmar" : loading ? "Confirmando..." : `✅ Confirmar venta ($${total})`}
          </button>
        </div>
      </div>
    </>
  );
}
