"use client";

import { useState, useEffect, useRef } from "react";
import ConfirmSaleButton from "@/components/ConfirmSaleButton";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { getPosEmployee } from "@/lib/posSession";

type Store = { id: string; name: string };

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;

  // OFERTAS (vienen del RPC products_with_stock)
  effective_price?: number | null;
  has_offer?: boolean | null;
  offer_type?: string | null;
  offer_value?: number | null;

  // PESABLES
  is_weighted?: boolean | null;
};

type CartItem = {
  product_id: string;
  name: string;
  sku: string | null;
  qty: number;

  // unit_price = precio que se cobra (ya viene con oferta si aplica)
  unit_price: number;

  // para mostrar info de oferta sin recalcular
  base_unit_price?: number; // precio normal (sin oferta)
  has_offer?: boolean;
  is_weighted?: boolean;
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
  const router = useRouter();

  useEffect(() => {
    const emp = getPosEmployee();
    if (!emp) {
      router.replace("/pos-login");
    }
  }, [router]);

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");

  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const cashInputRef = useRef<HTMLInputElement | null>(null);

  // ================= ROLES POS =================
  type Role = "cajero" | "supervisor";

  const SUPERVISOR_PIN =
    process.env.NEXT_PUBLIC_SUPERJUAMPY_SUPERVISOR_PIN ?? "2580";

  const [role, setRole] = useState<Role>(() => {
    if (typeof window === "undefined") return "cajero";
    return (localStorage.getItem("pos_role") as Role) || "cajero";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("pos_role", role);
    }
  }, [role]);

  const [showPin, setShowPin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const pendingActionRef = useRef<null | (() => void)>(null);

  function requireSupervisor(action: () => void) {
    if (role === "supervisor") return action();
    pendingActionRef.current = action;
    setPinInput("");
    setShowPin(true);
  }

  function submitPin() {
    if (pinInput === SUPERVISOR_PIN) {
      setRole("supervisor");
      setShowPin(false);
      const fn = pendingActionRef.current;
      pendingActionRef.current = null;
      if (fn) fn();
    } else {
      alert("PIN incorrecto");
      setPinInput("");
    }
  }

  function lockSupervisor() {
    setRole("cajero");
    if (typeof window !== "undefined") localStorage.removeItem("pos_role");
  }

  // --- Scanner de código de barras ---
  const scannerBufferRef = useRef("");
  const scannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Beep (sonido de scanner / POS) ---
  const audioCtxRef = useRef<AudioContext | null>(null);

  function playBeep(freq = 880, ms = 80, volume = 0.12) {
    try {
      const AudioCtx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }

      const ctx = audioCtxRef.current;

      if (ctx.state === "suspended") {
        void ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "square";
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + ms / 1000
      );

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + ms / 1000 + 0.02);
    } catch (e) {
      console.error("beep error", e);
    }
  }

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const unlock = () => {
      playBeep(440, 20, 0.001);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("mousedown", unlock);
      window.removeEventListener("touchstart", unlock);
    };

    window.addEventListener("keydown", unlock);
    window.addEventListener("mousedown", unlock);
    window.addEventListener("touchstart", unlock);

    return () => {
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("mousedown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ProductRow[]>([]);
  const [items, setItems] = useState<CartItem[]>([]);

  function getUnitPrice(p: ProductRow) {
    return Number((p.effective_price ?? p.price ?? 0) as any);
  }

  const totalItems = items.reduce((sum, it: any) => {
    if (it.is_weighted) return sum + 1; // fiambre cuenta 1
    return sum + it.qty; // producto normal
  }, 0);

  // Pago
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("efectivo");

  const [cashGivenStr, setCashGivenStr] = useState("");
  const [debitAmount, setDebitAmount] = useState(0);
  const [creditAmount, setCreditAmount] = useState(0);
  const [mpAmount, setMpAmount] = useState(0);
  const [accountAmount, setAccountAmount] = useState(0);

  const [notes, setNotes] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [registers, setRegisters] = useState<{ id: string; name: string }[]>(
    []
  );
  const [selectedRegisterId, setSelectedRegisterId] = useState<string | null>(
    null
  );

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

        if (list.length > 0 && !selectedStoreId) {
          setSelectedStoreId(list[0].id);
        }
      });
  }, []);

  // Cargar cajas (registers) cuando cambia la sucursal
  useEffect(() => {
    if (!selectedStoreId) {
      setRegisters([]);
      setSelectedRegisterId(null);
      return;
    }

    supabase
      .from("registers")
      .select("id, name")
      .eq("store_id", selectedStoreId)
      .eq("active", true)
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          alert("Error cargando cajas: " + error.message);
          return;
        }

        const list = data ?? [];
        setRegisters(list);

        if (list.length > 0) {
          setSelectedRegisterId(list[0].id);
        } else {
          setSelectedRegisterId(null);
        }
      });
  }, [selectedStoreId]);

  // ✅ SEARCH: manual muestra lista; scanner auto-agrega primero
  async function handleSearch(opts?: { term?: string; autoAddFirst?: boolean }) {
    const term = (opts?.term ?? search).trim();

    if (!term) {
      alert("Escribí nombre o SKU para buscar.");
      return;
    }
    if (!selectedStoreId) {
      alert("Elegí una sucursal antes de buscar.");
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase.rpc("products_with_stock", {
        p_store: selectedStoreId,
        p_query: term || null,
        p_limit: 100,
      });

      if (error) {
        console.error(error);
        alert("Error buscando productos: " + error.message);
        return;
      }

      const list = (data ?? []) as ProductRow[];
      setResults(list);

      // ✅ SOLO SCANNER: auto-agrega el primero
      if (opts?.autoAddFirst && list.length >= 1) {
        addToCartMaybeWeighted(list[0]);

        // flujo rápido
        setSearch("");
        setResults([]);
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 0);
      }
    } finally {
      setSearching(false);
    }
  }

  function calcLineTotal(it: {
    qty: number;
    unit_price: number;
    is_weighted?: boolean;
  }) {
    if (it.is_weighted) {
      // qty = gramos, unit_price = precio por kg
      return (it.unit_price * it.qty) / 1000;
    }
    // qty = unidades, unit_price = precio unitario
    return it.qty * it.unit_price;
  }

  function addToCartMaybeWeighted(p: ProductRow) {
    const isWeighted = Boolean((p as any).is_weighted);

    if (isWeighted) {
      const gramsStr = window.prompt(`Ingresar gramos para: ${p.name}`, "100");
      if (!gramsStr) return;

      const grams = Number(String(gramsStr).replace(",", "."));
      if (!Number.isFinite(grams) || grams <= 0) {
        alert("Gramos inválidos");
        return;
      }

      setItems((prev) => {
        const existing = prev.find((it) => it.product_id === p.id);
        if (existing) {
          return prev.map((it) =>
            it.product_id === p.id ? { ...it, qty: it.qty + grams } : it
          );
        }

        return [
          ...prev,
          {
            product_id: p.id,
            name: p.name,
            sku: p.sku,
            qty: grams,
            unit_price: getUnitPrice(p),
            is_weighted: true,
            base_unit_price: Number(p.price ?? 0),
            has_offer: Boolean(p.has_offer),
          } as any,
        ];
      });

      return;
    }

    addToCart(p);
  }

  function addToCart(p: ProductRow) {
    const isWeighted = Boolean((p as any).is_weighted);

    setItems((prev) => {
      const existing = prev.find((it) => it.product_id === p.id);

      if (existing) {
        if ((existing as any).is_weighted) {
          const gramsStr = window.prompt(`Sumar gramos a: ${existing.name}`, "50");
          if (!gramsStr) return prev;
          const grams = Number(String(gramsStr).replace(",", "."));
          if (!Number.isFinite(grams) || grams <= 0) return prev;

          return prev.map((it) =>
            it.product_id === p.id ? { ...it, qty: it.qty + grams } : it
          );
        }

        return prev.map((it) =>
          it.product_id === p.id ? { ...it, qty: it.qty + 1 } : it
        );
      }

      if (isWeighted) {
        const gramsStr = window.prompt(`Ingresar gramos para: ${p.name}`, "100");
        if (!gramsStr) return prev;

        const grams = Number(String(gramsStr).replace(",", "."));
        if (!Number.isFinite(grams) || grams <= 0) {
          alert("Gramos inválidos");
          return prev;
        }

        return [
          ...prev,
          {
            product_id: p.id,
            name: p.name,
            sku: p.sku,
            qty: grams,
            unit_price: getUnitPrice(p),
            is_weighted: true,
            base_unit_price: Number(p.price ?? 0),
            has_offer: Boolean(p.has_offer),
          } as any,
        ];
      }

      return [
        ...prev,
        {
          product_id: p.id,
          name: p.name,
          sku: p.sku,
          qty: 1,
          unit_price: getUnitPrice(p),
          base_unit_price: Number(p.price ?? 0),
          has_offer: Boolean(p.has_offer),
        },
      ];
    });

    // ✅ flujo rápido después de AGREGAR (no después de buscar)
    setSearch("");
    setResults([]);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  }

  function updateQty(product_id: string, qty: number) {
    setItems((prev) => {
      if (qty <= 0) {
        return prev.filter((it) => it.product_id !== product_id);
      }
      return prev.map((it) => (it.product_id === product_id ? { ...it, qty } : it));
    });
  }

  function removeItem(product_id: string) {
    setItems((prev) => prev.filter((it) => it.product_id !== product_id));
  }

  const total = items.reduce((sum, it) => sum + calcLineTotal(it as any), 0);
  const formattedTotal = total.toFixed(2);
  const cashGivenNum = Number(cashGivenStr || "") || 0;

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
      : cashGivenNum + debitAmount + creditAmount + mpAmount + accountAmount;

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

  // =========================
  // ATAJOS + SCANNER
  // =========================
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      const isTyping = tag === "input" || tag === "textarea" || tag === "select";
      if (isTyping) return;

      // F8 test sonido
      if (e.key === "F8") {
        e.preventDefault();
        playBeep(880, 90, 0.15);
        return;
      }

      // Scanner buffer
      if (scannerTimerRef.current) clearTimeout(scannerTimerRef.current);

      if (e.key === "Enter") {
        const code = scannerBufferRef.current.trim();
        scannerBufferRef.current = "";

        if (code.length >= 3) {
          e.preventDefault();
          setSearch(code);
          playBeep();
          void handleSearch({ term: code, autoAddFirst: true }); // ✅ scanner
        }
        return;
      }

      if (e.key.length === 1) {
        scannerBufferRef.current += e.key;

        scannerTimerRef.current = setTimeout(() => {
          const code = scannerBufferRef.current.trim();
          scannerBufferRef.current = "";
          if (code.length >= 6) {
            setSearch(code);
            playBeep();
            void handleSearch({ term: code, autoAddFirst: true }); // ✅ scanner
          }
        }, 80);
      }

      // F3 foco buscador
      if (e.key === "F3" || e.code === "F3") {
        e.preventDefault();
        setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }

      // F5 efectivo
      if (e.key === "F5") {
        e.preventDefault();
        setPaymentMethod("efectivo");
        setTimeout(() => cashInputRef.current?.focus(), 0);
        return;
      }

      // F6 cancelar
      if (e.key === "F6") {
        e.preventDefault();
        const ok = window.confirm("¿Cancelar venta y limpiar todo?");
        if (!ok) return;

        setItems([]);
        setSearch("");
        setResults([]);

        setPaymentMethod("efectivo");
        setCashGivenStr("0");
        setDebitAmount(0);
        setCreditAmount(0);
        setMpAmount(0);
        setAccountAmount(0);
        setNotes("");

        setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }

      if (items.length === 0) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const last = items[items.length - 1];
        if (last) removeItem(last.product_id);
        return;
      }

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        const last = items[items.length - 1];
        if (last) updateQty(last.product_id, last.qty + 1);
        return;
      }

      if (e.key === "F9") {
        e.preventDefault();
        const btn = document.querySelector('button[data-pos-confirm="1"]') as
          | HTMLButtonElement
          | null;
        if (btn && !btn.disabled) btn.click();
        return;
      }

      if (e.key === "-") {
        e.preventDefault();
        const last = items[items.length - 1];
        if (last) updateQty(last.product_id, last.qty - 1);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setResults([]);
        setSearch("");
        setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [items]);

  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 p-4">
      {/* COLUMNA IZQUIERDA */}
      <div className="md:col-span-1 space-y-3">
        <h1 className="text-xl font-semibold">POS — Nueva venta</h1>

        <div className="rounded border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          ⚠️ <strong>Recordá:</strong> verificar producto y precio antes de cobrar.
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="block text-sm mb-1">Sucursal</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={selectedStoreId ?? ""}
              onChange={(e) => setSelectedStoreId(e.target.value)}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {registers.length > 0 && (
              <div className="space-y-1">
                <label className="block text-sm mb-1">Caja</label>
                <select
                  className="border rounded px-3 py-2 w-full"
                  value={selectedRegisterId ?? ""}
                  onChange={(e) => setSelectedRegisterId(e.target.value)}
                >
                  {registers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
                  // ✅ búsqueda manual: muestra lista
                  void handleSearch({ term: search, autoAddFirst: false });
                }
              }}
            />
            <button
              onClick={() => void handleSearch({ term: search, autoAddFirst: false })}
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
                    SKU: {p.sku ?? "—"} ·{" "}
                    {p.has_offer ? (
                      <>
                        <span className="font-semibold text-green-700">
                          OFERTA: ${Number(p.effective_price ?? 0).toFixed(2)}
                        </span>{" "}
                        <span className="text-neutral-500 line-through ml-1">
                          ${Number(p.price ?? 0).toFixed(2)}
                        </span>
                      </>
                    ) : (
                      <>Precio: ${Number(p.price ?? 0).toFixed(2)}</>
                    )}
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

      {/* COLUMNA DERECHA */}
      <div className="md:col-span-2 flex flex-col gap-4">
        {/* Carrito */}
        <div className="bg-white shadow-xl rounded-xl p-5 space-y-3 border border-neutral-200">
          <h2 className="font-medium">
            Carrito{" "}
            {totalItems > 0 && (
              <span className="text-sm text-gray-600">({totalItems} ítems)</span>
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
                      <td className="py-1 pr-2">
                        {it.name}
                        {it.has_offer && (
                          <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-green-100 text-green-800">
                            OFERTA
                          </span>
                        )}
                      </td>

                      <td className="py-1 pr-2">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="px-2 py-1 rounded border text-xs"
                            onClick={() => {
                              if ((it as any).is_weighted) {
                                const gramsStr = window.prompt(
                                  `Restar gramos a: ${it.name}`,
                                  "50"
                                );
                                if (!gramsStr) return;
                                const grams = Number(String(gramsStr).replace(",", "."));
                                if (!Number.isFinite(grams) || grams <= 0) return;
                                updateQty(it.product_id, it.qty - grams);
                                return;
                              }
                              updateQty(it.product_id, it.qty - 1);
                            }}
                          >
                            -
                          </button>

                          <span className="w-16 text-center">
                            {(it as any).is_weighted ? `${it.qty} g` : it.qty}
                          </span>

                          <button
                            type="button"
                            className="px-2 py-1 rounded border text-xs"
                            onClick={() => {
                              if ((it as any).is_weighted) {
                                const gramsStr = window.prompt(
                                  `Sumar gramos a: ${it.name}`,
                                  "50"
                                );
                                if (!gramsStr) return;
                                const grams = Number(String(gramsStr).replace(",", "."));
                                if (!Number.isFinite(grams) || grams <= 0) return;
                                updateQty(it.product_id, it.qty + grams);
                                return;
                              }
                              updateQty(it.product_id, it.qty + 1);
                            }}
                          >
                            +
                          </button>
                        </div>
                      </td>

                      <td className="py-1 pr-2 text-right">
                        {it.has_offer ? (
                          <div className="inline-block text-right">
                            <div className="text-xs text-neutral-500 line-through">
                              ${Number(it.base_unit_price ?? 0).toFixed(2)}
                              {(it as any).is_weighted ? "/kg" : ""}
                            </div>
                            <div className="font-semibold text-green-700">
                              ${Number(it.unit_price).toFixed(2)}
                              {(it as any).is_weighted ? "/kg" : ""}
                            </div>
                          </div>
                        ) : (
                          <span>
                            ${Number(it.unit_price).toFixed(2)}
                            {(it as any).is_weighted ? "/kg" : ""}
                          </span>
                        )}
                      </td>

                      <td className="py-1 pr-2 text-right">
                        ${calcLineTotal(it as any).toFixed(2)}
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
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
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
                  <label className="text-sm font-medium">Con cuánto paga (efectivo)</label>
                  <input
                    ref={cashInputRef}
                    type="number"
                    className="w-full rounded-md border px-3 py-3 text-right text-xl"
                    value={cashGivenStr}
                    onChange={(e) => setCashGivenStr(e.target.value)}
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

              <NumberPad onPress={handlePadPress} onClear={handlePadClear} />
            </>
          )}

          {/* DEBITO / CREDITO / MP / CUENTA */}
          {paymentMethod !== "efectivo" && paymentMethod !== "mixto" && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Monto a cobrar</label>
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
                    else if (paymentMethod === "credito") setCreditAmount(v);
                    else if (paymentMethod === "mp") setMpAmount(v);
                    else setAccountAmount(v);
                  }}
                />
              </div>
              <div className="flex flex-col justify-center text-sm text-neutral-600">
                <span>Total de la venta: ${total}</span>
                <span>Monto ingresado: ${totalPaid}</span>
                {missing > 0 && (
                  <span className="text-red-600">Falta cobrar: ${missing}</span>
                )}
              </div>
            </div>
          )}

          {/* MIXTO */}
          {paymentMethod === "mixto" && (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Efectivo</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border px-2 py-1 text-right"
                    value={cashGivenNum}
                    onChange={(e) =>
                      setCashGivenStr(String(Number(e.target.value) || 0))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Débito</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border px-2 py-1 text-right"
                    value={debitAmount}
                    onChange={(e) => setDebitAmount(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Crédito</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border px-2 py-1 text-right"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Mercado Pago</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border px-2 py-1 text-right"
                    value={mpAmount}
                    onChange={(e) => setMpAmount(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Cuenta corriente</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border px-2 py-1 text-right"
                    value={accountAmount}
                    onChange={(e) => setAccountAmount(Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="space-y-1 text-sm">
                <p>Total venta: ${total}</p>
                <p>Total pagado: ${totalPaid}</p>
                {missing > 0 && <p className="text-red-600">Falta cobrar: ${missing}</p>}
                {change > 0 && <p className="text-green-700">Vuelto: ${change}</p>}
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
                  name: it.name,
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
                  setResults([]);
                  setSearch("");

                  setPaymentMethod("efectivo");
                  setCashGivenStr("0");
                  setDebitAmount(0);
                  setCreditAmount(0);
                  setMpAmount(0);
                  setAccountAmount(0);
                  setNotes("");

                  setTimeout(() => searchInputRef.current?.focus(), 0);
                }}
                storeId={selectedStoreId}
                registerId={selectedRegisterId}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
