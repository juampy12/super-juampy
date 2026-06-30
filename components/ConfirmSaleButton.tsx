"use client";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { exportReceiptPDF } from "@/app/_utils/receipt";

type ConfirmItem = {
  product_id: string;
  name: string;
  qty: number;
  unit_price: number;
  source?: "scale_barcode";
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
  onConfirmed?: (saleId?: string | null) => void;
  storeId?: string | null;
  registerId?: string | null;
  storeName?: string | null;
  isOnline?: boolean;
  onQueued?: () => void;
};

const METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  debito: "Débito",
  credito: "Crédito",
  mp: "Mercado Pago",
  cuenta_corriente: "Cuenta corriente",
  mixto: "Mixto",
};

export default function ConfirmSaleButton({
  items, total, payment, onConfirmed, storeId, registerId, storeName, isOnline = true, onQueued,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showTicket, setShowTicket] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<ConfirmItem[]>([]);
  const [savedTotal, setSavedTotal] = useState(0);
  const [savedPayment, setSavedPayment] = useState<PaymentInfo | null>(null);
  const inFlightRef = useRef(false);
  // UUID estable por venta. Se usa como clave de idempotencia en el servidor:
  // si el mismo key llega dos veces (timeout + reintento, o cola offline),
  // el servidor devuelve la venta existente sin crear un duplicado.
  // Se resetea después de cada venta confirmada o encolada para preparar la siguiente.
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  // Ref para que el listener de teclado siempre llame a la versión actual de confirmar
  const confirmarRef = useRef(confirmar);
  useEffect(() => { confirmarRef.current = confirmar; });

  // Cuando el modal está abierto: Enter confirma, Escape cancela.
  // Usamos capture phase para interceptar antes del listener global de ventas/page.tsx.
  useEffect(() => {
    if (!showModal) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        confirmarRef.current();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setShowModal(false);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [showModal]);

  function handleClick() {
    if (inFlightRef.current) return;
    if (!items || items.length === 0) { alert("No hay productos en el carrito."); return; }
    if (!storeId) { alert("Falta sucursal. Elegí una sucursal antes de confirmar."); return; }
    if (!registerId) { alert("Falta caja. Elegí Caja 1 / Caja 2 antes de confirmar."); return; }
    if (!payment) { alert("Falta información de pago."); return; }
    if ((payment.method === "efectivo" || payment.method === "mixto") && payment.total_paid < total) {
      alert(`El monto pagado ($${payment.total_paid}) es menor que el total ($${total}).`);
      return;
    }
    setShowModal(true);
  }

  async function confirmar() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setShowModal(false);
    setLoading(true);
    setSavedItems([...items]);
    setSavedTotal(total);
    setSavedPayment(payment ?? null);

    const currentKey = idempotencyKeyRef.current;

    try {
      // Sin conexión conocida: encolar directamente sin intentar la red.
      if (!isOnline) {
        const { addToQueue } = await import("@/lib/offlineQueue");
        addToQueue(
          { items, total, payment, store_id: storeId ?? "", register_id: registerId ?? null },
          currentKey,
        );
        idempotencyKeyRef.current = crypto.randomUUID();
        onConfirmed?.(null);
        onQueued?.();
        setShowTicket(true);
        return;
      }

      let res: Response;
      try {
        res = await fetch("/api/pos/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // idempotency_key se envía junto con el payload para que el servidor
          // pueda detectar y rechazar el duplicado si el request llega dos veces.
          body: JSON.stringify({
            items, total, payment,
            store_id: storeId, register_id: registerId,
            idempotency_key: currentKey,
          }),
        });
      } catch {
        // Error de red: el dispositivo perdió conectividad o el servidor es inalcanzable.
        // Encolar con el MISMO key que se envió al servidor: si el servidor ya procesó
        // la venta (pero la respuesta no llegó), el sync detectará el duplicado y
        // devolverá la venta existente en vez de crear una nueva.
        const { addToQueue } = await import("@/lib/offlineQueue");
        addToQueue(
          { items, total, payment, store_id: storeId ?? "", register_id: registerId ?? null },
          currentKey,
        );
        idempotencyKeyRef.current = crypto.randomUUID();
        onConfirmed?.(null);
        onQueued?.();
        setShowTicket(true);
        return;
      }

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        if (res.status >= 500) {
          // 5xx: servidor caído o error transitorio → encolar con el mismo key.
          const { addToQueue } = await import("@/lib/offlineQueue");
          addToQueue(
            { items, total, payment, store_id: storeId ?? "", register_id: registerId ?? null },
            currentKey,
          );
          idempotencyKeyRef.current = crypto.randomUUID();
          onConfirmed?.(null);
          onQueued?.();
          setShowTicket(true);
        } else if (res.status === 401) {
          // Sesión expirada: encolar la venta para no perderla y avisar al cajero.
          const { addToQueue } = await import("@/lib/offlineQueue");
          addToQueue(
            { items, total, payment, store_id: storeId ?? "", register_id: registerId ?? null },
            currentKey,
          );
          idempotencyKeyRef.current = crypto.randomUUID();
          onConfirmed?.(null);
          onQueued?.();
          setShowTicket(true);
          toast.error(
            "Tu sesión expiró. Recargá la página e iniciá sesión de nuevo. La venta quedó guardada.",
            { duration: 10000 },
          );
        } else {
          // 4xx: error permanente (producto inactivo, datos inválidos) → no encolar.
          // No se resetea el key: misma venta, el usuario puede corregir y reintentar.
          alert("Error al confirmar: " + (json?.error ?? json?.details ?? `HTTP ${res.status}`));
        }
        return;
      }

      const json = await res.json().catch(() => ({}));
      const saleId = json?.saleId ?? null;
      setLastSaleId(saleId);
      idempotencyKeyRef.current = crypto.randomUUID();
      onConfirmed?.(saleId);
      setShowTicket(true);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }

  async function imprimirTicket() {
    await exportReceiptPDF({
      saleId: lastSaleId ?? undefined,
      storeName: storeName ?? "Super Juampy",
      items: savedItems.map(it => ({
        name: it.name,
        qty: it.qty,
        price: it.unit_price,
        subtotal: it.qty * it.unit_price,
      })),
      payMethod: savedPayment?.method ?? "efectivo",
      amount: savedPayment?.total_paid ?? 0,
      change: savedPayment?.change ?? 0,
      total: savedTotal,
    });
    setShowTicket(false);
  }

  return (
    <>
      {showTicket && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#fff", borderRadius:16, padding:"28px 32px", maxWidth:320, width:"90%", textAlign:"center", boxShadow:"0 8px 32px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
            <h2 style={{ fontSize:20, fontWeight:600, marginBottom:8, color:"#111" }}>Venta confirmada</h2>
            <p style={{ fontSize:15, color:"#555", marginBottom:4 }}>Total: <strong>${savedTotal.toFixed(2)}</strong></p>
            <p style={{ fontSize:13, color:"#777", marginBottom:24 }}>
              {METHOD_LABELS[savedPayment?.method ?? ""] ?? savedPayment?.method}
              {(savedPayment?.change ?? 0) > 0 && ` · Vuelto: $${(savedPayment?.change ?? 0).toFixed(2)}`}
            </p>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setShowTicket(false)} style={{ flex:1, padding:"11px 0", borderRadius:8, border:"1px solid #ddd", background:"#fff", cursor:"pointer", fontSize:14, color:"#333" }}>
                Cerrar
              </button>
              <button onClick={imprimirTicket} style={{ flex:2, padding:"11px 0", borderRadius:8, border:"none", background:"#1d4ed8", color:"#fff", cursor:"pointer", fontSize:14, fontWeight:600 }}>
                🖨️ Imprimir ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9998, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#fff", borderRadius:16, padding:"24px 28px", maxWidth:340, width:"90%", boxShadow:"0 8px 32px rgba(0,0,0,0.2)" }}>
            <h2 style={{ fontSize:18, fontWeight:500, marginBottom:16, color:"#111" }}>Confirmar venta</h2>
            <div style={{ fontSize:14, color:"#555", marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span>Total</span><strong>${total.toFixed(2)}</strong>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span>Método</span><span>{METHOD_LABELS[payment?.method ?? ""] ?? payment?.method}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span>Pagado</span><span>${(payment?.total_paid ?? 0).toFixed(2)}</span>
              </div>
              {(payment?.change ?? 0) > 0 && (
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, color:"#059669", fontWeight:500 }}>
                  <span>Vuelto</span><span>${(payment?.change ?? 0).toFixed(2)}</span>
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
