"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  saleId: string;
  productId: string;
  qty: number;
  onConfirmed?: () => void;
};

export default function ConfirmSaleButton({ saleId, productId, qty, onConfirmed }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    try {
      setLoading(true);

      const res = await fetch("/api/pos/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId, productId, qty }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      // Mensaje simple de confirmación
      alert("Venta confirmada");

      // Refrescar datos de la página (listas/reportes)
      router.refresh();

      // Callback opcional de la página
      onConfirmed?.();
    } catch (e: any) {
      console.error(e);
      alert("Error al confirmar: " + (e?.message ?? "desconocido"));
    } finally {
      setLoading(false);
    }
  }

  return (
    
  );
}


