"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  method:
    | "efectivo"
    | "debito"
    | "credito"
    | "mp"
    | "cuenta_corriente"
    | "mixto";
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
};
export default function ConfirmSaleButton({
  items,
  total,
  payment,
  onConfirmed,
  storeId,
  registerId,
}: Props) {
  const [loading, setLoading] = useState(false);
const inFlightRef = useRef(false);
  const router = useRouter();

  async function handleClick() {
if (inFlightRef.current) return;
    if (!items || items.length === 0) {
      alert("No hay productos en el carrito.");
      return;
    }
if (!storeId) {
  alert("Falta sucursal (storeId). Elegí una sucursal antes de confirmar.");
  return;
}
if (!registerId) {
  alert("Falta caja. Elegí Caja 1 / Caja 2 antes de confirmar.");
  return;
}
const storeIdToUse = storeId;
    if (!payment) {
      alert("Falta información de pago.");
      return;
    }

    // Validaciones básicas
    if (payment.method === "efectivo" || payment.method === "mixto") {
      if (payment.total_paid < total) {
        alert(
          `El monto pagado ($${payment.total_paid}) es menor que el total ($${total}).`
        );
        return;
      }
    }
try {
  // ✅ Confirmación antes de registrar la venta
// 🔒 Paso 5: bloqueo anti doble confirmación
if (inFlightRef.current) return;
inFlightRef.current = true;

// Confirmación antes de registrar la venta
const ok = window.confirm(
  `¿Confirmar venta?\n\nTotal: $${total}\nMétodo: ${payment.method}\nPagado: $${payment.total_paid}`
);
if (!ok) {
  inFlightRef.current = false;
  return;
}

setLoading(true);

  const res = await fetch("/api/pos/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items,
      total,
      payment,
      store_id: storeIdToUse,
register_id: registerId ?? null,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `HTTP ${res.status}`);
  }

  alert("Venta confirmada");
  router.refresh();
  onConfirmed?.();
} catch (e: any) {

      console.error(e);
      alert("Error al confirmar: " + (e?.message ?? "desconocido"));
    } finally {
      setLoading(false);
inFlightRef.current = false;
    }
  }

return (
  <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t shadow-[0_-6px_12px_-6px_rgba(0,0,0,0.3)]">
    <div className="max-w-4xl mx-auto p-4">
      <button
        type="button"
        data-pos-confirm="1"
        onClick={() => {
          void handleClick();
        }}
        disabled={loading || items.length === 0}
        className="
          w-full
          rounded-xl
          px-6 py-4
          text-lg font-bold
          text-white
          bg-green-600 hover:bg-green-700
          disabled:bg-gray-400 disabled:cursor-not-allowed
          shadow-xl
        "
      >
        {items.length === 0
          ? "Agregá productos para confirmar"
          : loading
          ? "Confirmando..."
          : `✅ Confirmar venta ($${total})`}
      </button>
    </div>
  </div>
);
}
