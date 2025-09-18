"use client";
import React, { useState } from "react";
import { posConfirmarVenta, type PosRow } from "../lib/posConfirm";

type AnyItem = any;

function showToast(msg: string) {
  try {
    let el = document.getElementById("sj-toast") as HTMLDivElement | null;
    if (!el) {
      el = document.createElement("div");
      el.id = "sj-toast";
      el.setAttribute(
        "style",
        "position:fixed;right:16px;bottom:16px;background:#16a34a;color:#fff;padding:10px 14px;border-radius:8px;z-index:99999;box-shadow:0 6px 20px rgba(0,0,0,.2);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.2"
      );
      document.body.appendChild(el);
    }
    el.textContent = msg;
    // auto-ocultar a los 3s (reseteable)
    // @ts-ignore
    clearTimeout(el._t);
    // @ts-ignore
    el._t = setTimeout(() => el && el.remove(), 3000);
  } catch (e) {
    console.warn("toast failed", e);
  }
}

type Props = {
  /** UUID de la sucursal (stores.id) */
  storeId: string;

  /** Ítems del ticket (preferido). Cada item debe tener id/product_id y qty/price. */
  cartItems?: AnyItem[];

  /** Compatibilidad: un solo producto */
  productId?: string;
  qty?: number;

  onConfirmed?: (saleId: string) => void;
};

export default function ConfirmSaleButton({
  storeId,
  cartItems = [],
  productId,
  qty,
  onConfirmed,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function handleClick(e?: React.MouseEvent<HTMLButtonElement>) {
    e?.preventDefault();
    e?.stopPropagation();
    console.log("🔊 BTN: click");
    setOkMsg(null);
    try {
      if (!storeId) throw new Error("Falta storeId (UUID de la sucursal).");

      console.log("🔊 BTN: cartItems =", cartItems);

      let rows: PosRow[] =
        cartItems.length > 0
          ? cartItems.map((it: AnyItem) => ({
              id: it.product_id ?? it.id ?? it.product?.id,
              qty: Number(it.cant ?? it.qty ?? it.quantity ?? it.count ?? 1),
              price: Number(
                it.precio ?? it.price ?? it.unit_price ?? it.unitPrice ?? 0
              ),
            }))
          : productId
          ? [{ id: productId, qty: Number(qty ?? 1), price: 0 }]
          : [];

      if (rows.length === 0)
        throw new Error("No hay ítems en el ticket para confirmar.");

      setLoading(true);
      console.log("🔊 BTN: llamando RPC con rows =", rows);

      const saleId = await posConfirmarVenta(storeId, rows);

      console.log("🔊 BTN: RPC OK saleId =", saleId);
      const msg = `Venta confirmada ✔️ #${String(saleId).slice(0,8)}`;
      setOkMsg(msg);
      onConfirmed?.(saleId);

      // ✅ Toast flotante (no depende de React)
      showToast(msg);

      // Fallback (por si el navegador bloquea el toast)
      try { alert(`Venta confirmada ✔️\nTicket: ${saleId}`); } catch {}

      setTimeout(() => setOkMsg(null), 3000);
    } catch (err: any) {
      console.error("🔊 BTN: ERROR", err);
      alert("ERROR al confirmar venta: " + (err?.message ?? String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="px-4 py-2 rounded-md bg-blue-600 text-white disabled:opacity-50"
      >
        {loading ? "Confirmando..." : "Confirmar venta"}
      </button>

      {okMsg && (
        <div className="text-sm rounded-md bg-green-600/10 text-green-700 border border-green-600/30 px-3 py-2">
          {okMsg}
        </div>
      )}
    </div>
  );
}
