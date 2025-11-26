"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ConfirmItem = {
  product_id: string;
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
};

export default function ConfirmSaleButton({
  items,
  total,
  payment,
  onConfirmed,
}: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    if (!items || items.length === 0) {
      alert("No hay productos en el carrito.");
      return;
    }

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
      setLoading(true);

      const res = await fetch("/api/pos/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          total,
          payment,
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
    }
  }

  return (
    <button
      type="button"
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
