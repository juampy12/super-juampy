"use client";
import { useEffect, useMemo, useState } from "react";

type Props = {
  subtotal: number;
  onCharge?: (p: { paymentType: "cash"|"debit"|"credit"; amountTendered?: number }) => void;
};

export default function PaymentPanel({ subtotal, onCharge }: Props) {
  const [amount, setAmount] = useState<number>(subtotal);
  useEffect(() => { setAmount(subtotal); }, [subtotal]);

  const change = useMemo(() => Math.max(0, (amount || 0) - subtotal), [amount, subtotal]);
  const quicks = [1000, 2000, 5000, subtotal];

  return (
    <div className="rounded-2xl border bg-white p-4 md:p-5 space-y-4 w-full max-w-[420px]">
      <h3 className="text-lg md:text-xl font-semibold">Cobro</h3>

      <div className="flex items-center gap-3">
        <input
          inputMode="numeric"
          className="h-12 w-full rounded-xl border px-3 text-lg"
          value={Number.isFinite(amount) ? amount : ""}
          onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "")) || 0)}
          placeholder="Monto entregado"
        />
        <button onClick={() => setAmount(subtotal)} className="h-12 rounded-xl px-4 bg-slate-100 hover:bg-slate-200">
          Exacto
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {quicks.map((q) => (
          <button key={q} onClick={() => setAmount(q)} className="h-12 rounded-xl px-4 bg-slate-100 hover:bg-slate-200">
            ${q.toLocaleString("es-AR")}
          </button>
        ))}
      </div>

      <div className="flex justify-between text-lg font-medium">
        <span>Total</span><span>${subtotal.toLocaleString("es-AR")}</span>
      </div>
      <div className="flex justify-between text-lg">
        <span>Vuelto</span><span>${change.toLocaleString("es-AR")}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-2">
        <button
          onClick={() => onCharge?.({ paymentType: "cash", amountTendered: amount })}
          className="col-span-3 h-12 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
        >
          Cobrar en efectivo
        </button>
        <button onClick={() => onCharge?.({ paymentType: "debit" })} className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200">
          Débito
        </button>
        <button onClick={() => onCharge?.({ paymentType: "credit" })} className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200">
          Crédito
        </button>
      </div>
    </div>
  );
}
