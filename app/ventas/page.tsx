"use client";

import { useState, useEffect, useRef } from "react";
import ConfirmSaleButton from "@/components/ConfirmSaleButton";
import { supabase } from "@/lib/supabase";

type Store = { id: string; name: string };

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
};

type CartItem = {
  product_id: string;
  name: string;
  sku: string | null;
  qty: number;
  unit_price: number;
};

type PaymentMethod =
  | "efectivo"
  | "debito"
  | "credito"
  | "mp"
  | "cuenta_corriente"
  | "mixto";

function NumberPad({
  onPress,
  onClear,
}: {
  onPress: (digit: string) => void;
  onClear: () => void;
}) {
  const buttons = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  return (
    <div className="grid grid-cols-3 gap-3 mt-4">
      {buttons.map((b) => (
        <button
          key={b}
          onClick={() => onPress(b)}
          className="bg-neutral-900 text-white text-xl py-4 rounded-lg shadow hover:bg-neutral-800"
        >
          {b}
        </button>
      ))}
      <button
        onClick={onClear}
        className="col-span-3 bg-red-600 text-white text-lg py-3 rounded-lg"
      >
        BORRAR
      </button>
    </div>
  );
}

export default function VentasPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");

  const [search, setSearch] = useState("");
const searchInputRef = useRef<HTMLInputElement | null>(null);

useEffect(() => {
  searchInputRef.current?.focus();
}, []);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ProductRow[]>([]);
  const [items, setItems] = useState<CartItem[]>([]);
const totalItems = items.reduce((sum, it) => sum + it.qty, 0);
  // Pago
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("efectivo");

  // Montos (guardamos EFECTIVO como string para el keypad)
  const [cashGivenStr, setCashGivenStr] = useState("");
  const [debitAmount, setDebitAmount] = useState(0);
  const [creditAmount, setCreditAmount] = useState(0);
  const [mpAmount, setMpAmount] = useState(0);
  const [accountAmount, setAccountAmount] = useState(0);

  const [notes, setNotes] = useState("");

  // Cargar sucursales
  useEffect(() => {
    supabase
      .from("stores")
      .select("id,name")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          alert("Error cargando sucursales: " + error.message);
          return;
        }
        const list = data ?? [];
        setStores(list);
        if (list.length > 0 && !storeId) {
          setStoreId(list[0].id);
        }
      });
  }, []);

  async function handleSearch() {
    const term = search.trim();
    if (!term) {
      alert("Escribí nombre o SKU para buscar.");
      return;
    }
    if (!storeId) {
      alert("Elegí una sucursal antes de buscar.");
      return;
    }

    setSearching(true);
    try {
      const q = term || null;

      const { data, error } = await supabase.rpc("products_with_stock", {
        p_store: storeId,
        p_query: q,
        p_limit: 100,
      });

      if (error) {
        console.error(error);
        alert("Error buscando productos: " + error.message);
        return;
      }

          // el RPC devuelve id, name, sku, price, stock; usamos los campos necesarios
    const list = (data ?? []) as ProductRow[];
    setResults(list);

    // 🔥 Si solo hay un resultado, lo agregamos directo al carrito
    if (list.length === 1) {
      addToCart(list[0]);
    }

    } finally {
      setSearching(false);
    }
  }

  function addToCart(p: ProductRow) {
  setItems((prev) => {
    const existing = prev.find((it) => it.product_id === p.id);
    if (existing) {
      return prev.map((it) =>
        it.product_id === p.id ? { ...it, qty: it.qty + 1 } : it
      );
    }

    return [
      ...prev,
      {
        product_id: p.id,
        name: p.name,
        sku: p.sku,
        qty: 1,
        unit_price: p.price ?? 0,
      },
    ];
  });

  // 🔥 Flujo cajero rápido
  setSearch("");      // borra el texto del buscador
  setResults([]);     // limpia la lista de resultados
  setTimeout(() => {
    searchInputRef.current?.focus();  // vuelve a enfocar el input
  }, 0);
}


  

  function updateQty(product_id: string, qty: number) {
  setItems((prev) => {
    // si la cantidad es 0 o menos, sacamos el item del carrito
    if (qty <= 0) {
      return prev.filter((it) => it.product_id !== product_id);
    }

    // si es > 0, actualizamos la cantidad
    return prev.map((it) =>
      it.product_id === product_id ? { ...it, qty } : it
    );
  });
}

  function removeItem(product_id: string) {
    setItems((prev) => prev.filter((it) => it.product_id !== product_id));
  }

  const total = items.reduce(
  (sum, it) => sum + it.qty * it.unit_price,
  0
);

const formattedTotal = total.toFixed(2);

const cashGivenNum = Number(cashGivenStr || "") || 0;


  // Total pagado según método
  const totalPaid =
    paymentMethod === "efectivo"
      ? cashGivenNum
      : paymentMethod === "debito"
      ? debitAmount
      : paymentMethod === "credito"
      ? creditAmount
      : paymentMethod === "mp"
      ? mpAmount
      : paymentMethod === "cuenta_corriente"
      ? accountAmount
      : // mixto
        cashGivenNum +
        debitAmount +
        creditAmount +
        mpAmount +
        accountAmount;

  const diff = totalPaid - total;
  const change = diff > 0 ? diff : 0;
  const missing = diff < 0 ? Math.abs(diff) : 0;

  function handlePadPress(digit: string) {
    setCashGivenStr((prev) => {
      if (prev === "0") return digit;
      return prev + digit;
    });
  }

  function handlePadClear() {
    setCashGivenStr("0");
  }

  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 p-4">
      {/* COLUMNA IZQUIERDA: sucursal + búsqueda y resultados */}
      <div className="md:col-span-1 space-y-3">
        <h1 className="text-xl font-semibold">POS — Nueva venta</h1>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="block text-sm mb-1">Sucursal</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <h2 className="font-medium">Buscar producto</h2>

          <div className="flex gap-2">
           <input
  ref={searchInputRef}
  type="text"
  placeholder="Nombre o SKU"
  className="border rounded px-3 py-2 flex-1"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  }}
/>
            <button
              onClick={() => {
                void handleSearch();
              }}
              disabled={searching}
              className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {searching ? "Buscando..." : "Buscar"}
            </button>
          </div>

          <div className="border rounded-md max-h-80 overflow-auto bg-white">
            {results.length === 0 && (
              <p className="px-3 py-2 text-sm text-neutral-500">
                No hay resultados. Elegí sucursal y buscá por nombre o SKU.
              </p>
            )}

            {results.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between border-b px-3 py-2 last:border-b-0 hover:bg-neutral-50"
              >
                <div>
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-neutral-600">
                    SKU: {p.sku ?? "—"} · Precio: ${p.price ?? 0}
                  </p>
                </div>
                <button
                  onClick={() => addToCart(p)}
                  className="rounded border px-2 py-1 text-xs font-medium hover:bg-neutral-100"
                >
                  Agregar
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* COLUMNA DERECHA: carrito + pago */}
      <div className="md:col-span-2 flex flex-col gap-4">
        {/* Carrito */}
        <div className="bg-white shadow-xl rounded-xl p-5 space-y-3 border border-neutral-200">
          <h2 className="font-medium">
  Carrito{" "}
  {totalItems > 0 && (
    <span className="text-sm text-gray-600">
      ({totalItems} ítems)
    </span>
  )}
</h2>


          <div className="border rounded-md overflow-hidden">
            {items.length === 0 ? (
              <p className="px-3 py-2 text-sm text-neutral-500">
                Todavía no agregaste productos.
              </p>
            ) : (
              <table className="min-w-full text-sm">
  <thead>
    <tr className="border-b text-left">
      <th className="py-2 pr-2">Producto</th>
      <th className="py-2 pr-2 text-right">Cant.</th>
      <th className="py-2 pr-2 text-right">Precio</th>
      <th className="py-2 pr-2 text-right">Subtotal</th>
<th className="py-2 pr-2 text-right">Acciones</th>
    </tr>
  </thead>
  <tbody>
    {items.map((it) => (
      <tr key={it.product_id} className="border-b last:border-0">
        <td className="py-1 pr-2">{it.name}</td>
        <td className="py-1 pr-2">
  <div className="flex items-center justify-end gap-2">
    <button
      type="button"
      className="px-2 py-1 rounded border text-xs"
      onClick={() => updateQty(it.product_id, it.qty - 1)}
    >
      -
    </button>
    <span className="w-6 text-center">{it.qty}</span>
    <button
      type="button"
      className="px-2 py-1 rounded border text-xs"
      onClick={() => updateQty(it.product_id, it.qty + 1)}
    >
      +
    </button>
  </div>
</td>
        <td className="py-1 pr-2 text-right">
          ${it.unit_price.toFixed(2)}
        </td>
        <td className="py-1 pr-2 text-right">
          ${(it.qty * it.unit_price).toFixed(2)}
        </td>
<td className="py-1 pr-2 text-right">
  <button
    type="button"
    className="px-2 py-1 rounded border text-xs text-red-600"
    onClick={() => removeItem(it.product_id)}
  >
    Quitar
  </button>
</td>
      </tr>
    ))}
  </tbody>
</table>

            )}
          </div>

          <div className="mt-3 flex justify-end">
  <div className="inline-flex items-baseline gap-2 rounded-lg bg-neutral-900 text-white px-4 py-2">
    <span className="text-sm font-medium">TOTAL</span>
    <span className="text-2xl font-bold">${formattedTotal}</span>
  </div>
</div>
        </div>

        {/* Pago */}
        <div className="bg-white shadow-xl rounded-xl p-5 space-y-4 border border-neutral-200">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-medium">Pago</h2>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm font-medium">Método:</span>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as PaymentMethod)
                }
                className="rounded border px-2 py-1 text-sm"
              >
                <option value="efectivo">Efectivo</option>
                <option value="debito">Débito</option>
                <option value="credito">Crédito</option>
                <option value="mp">Mercado Pago</option>
                <option value="cuenta_corriente">Cuenta corriente</option>
                <option value="mixto">Mixto (varios métodos)</option>
              </select>
            </div>
          </div>

          {/* EFECTIVO */}
          {paymentMethod === "efectivo" && (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Con cuánto paga (efectivo)
                  </label>
                  <input
  type="number"
  className="w-full rounded-md border px-3 py-3 text-right text-xl"
  value={cashGivenStr}
  onChange={(e) => {
    setCashGivenStr(e.target.value);
  }}
/>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Vuelto</label>
                  <input
                    readOnly
                    className="w-full rounded border bg-neutral-50 px-2 py-3 text-right text-xl"
                    value={change.toFixed(2)}
                  />
                </div>
              </div>

              <NumberPad
                onPress={handlePadPress}
                onClear={handlePadClear}
              />
            </>
          )}

          {/* DEBITO / CREDITO / MP / CUENTA */}
          {paymentMethod !== "efectivo" &&
            paymentMethod !== "mixto" && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Monto a cobrar
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border px-2 py-1 text-right"
                    value={
                      paymentMethod === "debito"
                        ? debitAmount
                        : paymentMethod === "credito"
                        ? creditAmount
                        : paymentMethod === "mp"
                        ? mpAmount
                        : accountAmount
                    }
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      if (paymentMethod === "debito") setDebitAmount(v);
                      else if (paymentMethod === "credito")
                        setCreditAmount(v);
                      else if (paymentMethod === "mp") setMpAmount(v);
                      else setAccountAmount(v);
                    }}
                  />
                </div>
                <div className="flex flex-col justify-center text-sm text-neutral-600">
                  <span>Total de la venta: ${total}</span>
                  <span>Monto ingresado: ${totalPaid}</span>
                  {missing > 0 && (
                    <span className="text-red-600">
                      Falta cobrar: ${missing}
                    </span>
                  )}
                </div>
              </div>
            )}

          {/* MIXTO */}
          {paymentMethod === "mixto" && (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Efectivo
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border px-2 py-1 text-right"
                    value={cashGivenNum}
                    onChange={(e) =>
                      setCashGivenStr(
                        String(Number(e.target.value) || 0)
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Débito
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border px-2 py-1 text-right"
                    value={debitAmount}
                    onChange={(e) =>
                      setDebitAmount(Number(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Crédito
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border px-2 py-1 text-right"
                    value={creditAmount}
                    onChange={(e) =>
                      setCreditAmount(Number(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Mercado Pago
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border px-2 py-1 text-right"
                    value={mpAmount}
                    onChange={(e) =>
                      setMpAmount(Number(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Cuenta corriente
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border px-2 py-1 text-right"
                    value={accountAmount}
                    onChange={(e) =>
                      setAccountAmount(
                        Number(e.target.value) || 0
                      )
                    }
                  />
                </div>
              </div>

              <div className="space-y-1 text-sm">
                <p>Total venta: ${total}</p>
                <p>Total pagado: ${totalPaid}</p>
                {missing > 0 && (
                  <p className="text-red-600">
                    Falta cobrar: ${missing}
                  </p>
                )}
                {change > 0 && (
                  <p className="text-green-700">
                    Vuelto: ${change}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium">Notas</label>
            <textarea
              rows={2}
              className="w-full rounded border px-2 py-1 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Pago mixto, datos de la tarjeta, cliente de cuenta corriente, etc."
            />
          </div>

          {items.length > 0 && (
            <div className="flex justify-end">
              <ConfirmSaleButton
                items={items.map((it) => ({
                  product_id: it.product_id,
                  qty: it.qty,
                  unit_price: it.unit_price,
                }))}
                total={total}
                payment={{
                  method: paymentMethod,
                  total_paid: totalPaid,
                  change,
                  breakdown: {
                    cash: cashGivenNum || undefined,
                    debit: debitAmount || undefined,
                    credit: creditAmount || undefined,
                    mp: mpAmount || undefined,
                    account: accountAmount || undefined,
                  },
                  notes: notes || undefined,
                }}
                onConfirmed={() => {
                  setItems([]);
                  setCashGivenStr("0");
                  setDebitAmount(0);
                  setCreditAmount(0);
                  setMpAmount(0);
                  setAccountAmount(0);
                  setNotes("");
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
