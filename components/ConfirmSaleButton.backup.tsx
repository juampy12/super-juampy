"use client";
import { useState } from "react";
import { confirmSale } from "../lib/sales";
const money = new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:2});
export default function ConfirmSaleButton({ saleId, productId, defaultQty=1, onConfirmed }: any) {
  const [qty,setQty]=useState<number>(defaultQty);
  const [loading,setLoading]=useState(false);
  const [okMsg,setOkMsg]=useState<string|null>(null);
  const [errMsg,setErrMsg]=useState<string|null>(null);
  const handleConfirm = async () => {
    setOkMsg(null); setErrMsg(null);
    try{
      setLoading(true);
      const item = await confirmSale({ saleId, productId, qty });
      const txt = `Venta confirmada: ${Number(item.qty)} x ${money.format(Number(item.unit_price??0))} = ${money.format(Number(item.subtotal??0))}`;
      setOkMsg(txt); try{ alert(txt); }catch{}
      window.dispatchEvent(new CustomEvent("sale:confirmed",{ detail:{ item } }));
      onConfirmed?.(item);
      setTimeout(()=>setOkMsg(null),4000);
    }catch(e:any){
      const msg = e?.message || "No se pudo confirmar la venta";
      setErrMsg(msg); try{ alert("Error: "+msg); }catch{}
      setTimeout(()=>setErrMsg(null),6000);
      console.error("[ConfirmSaleButton] error:", e);
    }finally{ setLoading(false); }
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input type="number" min={1} step={1} value={qty}
          onChange={(e)=>setQty(Number(e.target.value))}
          className="border rounded px-2 py-1 w-20" />
        
      </div>
      {okMsg && <div className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded border border-green-300">{okMsg}</div>}
      {errMsg && <div className="text-sm bg-red-100 text-red-700 px-2 py-1 rounded border border-red-300">{errMsg}</div>}
    </div>
  );
}


