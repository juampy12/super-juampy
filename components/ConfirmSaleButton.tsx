"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  saleId?: string;       // ya no lo usamos, pero lo dejamos por compatibilidad
  productId: string;     // ID o SKU del producto
  qty?: number;          // cantidad directa
  defaultQty?: number;   // cantidad por defecto (viene desde la page vieja)
  onConfirmed?: () => void;
};

export default function ConfirmSaleButton({
  saleId,        // no usado, pero lo dejamos para no romper props
  productId,
  qty,
  defaultQty,
  onConfirmed,
}: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // usamos qty si viene, si no defaultQty, si no 1
  const finalQty = qty ?? defaultQty ?? 1;

  async function handleClick() {
    try {
      setLoading(true);

      const body = {
        // el route actual mira body.items (o body.detalle, body.cart, etc.)
        items: [
          {
            product_id: productId,
            qty: finalQty,
          },
        ],
        // dejamos estos campos opcionales por si en el futuro los usamos
        // total: 0,
        // storeId: null,
        // payment: {},
      };

      const res = await fetch("/api/pos/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const json = await res.json().catch(() => ({}));
      if (json?.ok === false) {
        throw new Error(json.error || "Error en confirm_sale");
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
      onClick={handleClick}
      disabled={loading}
      className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "Confirmando..." : `Confirmar venta (${finalQty})`}
    </button>
  );
}
