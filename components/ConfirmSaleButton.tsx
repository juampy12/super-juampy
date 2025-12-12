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
};

export default function ConfirmSaleButton({
  items,
  total,
  payment,
  onConfirmed,
storeId,
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
    <button
      type="button"
data-pos-confirm="1"
      onClick={() => {
        void handleClick();
      }}
      disabled={loading || items.length === 0}
      className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "Confirmando..." : `Confirmar venta ($${total})`}
    </button>
  );
}
