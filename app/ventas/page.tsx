"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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

  // (opcional) si el RPC devuelve stock
  stock?: number | null;
};

type CartItem = {
  product_id: string;
  name: string;
  sku: string | null;
  qty: number;
  unit_price: number;
  base_unit_price?: number;
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

// ===== helpers UI (A) =====
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;

  const re = new RegExp(`(${escapeRegExp(q)})`, "ig");
  const parts = text.split(re);

  return (
    <>
      {parts.map((p, i) => {
        const isHit = re.test(p);
        re.lastIndex = 0;
        return isHit ? (
          <mark key={i} className="rounded px-1 bg-yellow-200">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        );
      })}
    </>
  );
}

function paymentLabel(m: PaymentMethod) {
  switch (m) {
    case "efectivo":
      return "Efectivo";
    case "debito":
      return "Débito";
    case "credito":
      return "Crédito";
    case "mp":
      return "Mercado Pago";
    case "cuenta_corriente":
      return "Cuenta corriente";
    case "mixto":
      return "Mixto";
    default:
      return m;
  }
}

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export default function VentasPage() {
  const router = useRouter();

  useEffect(() => {
    const emp = getPosEmployee();
    if (!emp) router.replace("/pos-login");
  }, [router]);

  // ================= ROLES POS =================
  type Role = "cajero" | "supervisor";
  const SUPERVISOR_PIN =
    process.env.NEXT_PUBLIC_SUPERJUAMPY_SUPERVISOR_PIN ?? "2580";

  const [role, setRole] = useState<Role>(() => {
    if (typeof window === "undefined") return "cajero";
    return (localStorage.getItem("pos_role") as Role) || "cajero";
  });

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("pos_role", role);
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

  // ================= D) MODO CAJERO RÁPIDO =================
  const quickMode = false;

  // --- Scanner de código de barras ---
  const scannerBufferRef = useRef("");
  const scannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Beep ---
  const audioCtxRef = useRef<AudioContext | null>(null);

  function playBeep(freq = 880, ms = 80, volume = 0.12) {
    try {
      const AudioCtx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;

      if (ctx.state === "suspended") void ctx.resume();

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

  // refs foco
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const cashInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // unlock audio
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

  // =========================
  // C) FEEDBACK POST VENTA (overlay)
  // =========================
  const [saleFeedback, setSaleFeedback] = useState<null | {
    total: number;
    method: PaymentMethod;
    change: number;
    items: number;
    at: number;
  }>(null);

  const confirmLockRef = useRef(false);

  function showSaleFeedback(payload: {
    total: number;
    method: PaymentMethod;
    change: number;
    items: number;
  }) {
    setSaleFeedback({ ...payload, at: Date.now() });
    confirmLockRef.current = true;

    setTimeout(() => {
      confirmLockRef.current = false;
    }, 650);

    setTimeout(() => {
      setSaleFeedback(null);
    }, quickMode ? 850 : 1400);
  }

  // =========================
  // DATA
  // =========================
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  const [registers, setRegisters] = useState<{ id: string; name: string }[]>(
    []
  );
  const [selectedRegisterId, setSelectedRegisterId] = useState<string | null>(
    null
  );

  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ProductRow[]>([]);
  const [items, setItems] = useState<CartItem[]>([]);

  // Pago
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("efectivo");
  const [cashGivenStr, setCashGivenStr] = useState("0");
  const [debitAmount, setDebitAmount] = useState(0);
  const [creditAmount, setCreditAmount] = useState(0);
  const [mpAmount, setMpAmount] = useState(0);
  const [accountAmount, setAccountAmount] = useState(0);
  const [notes, setNotes] = useState("");

  // En modo rápido: fuerza métodos simples y UI simple
  useEffect(() => {
    if (!quickMode) return;

    if (
      paymentMethod === "credito" ||
      paymentMethod === "mp" ||
      paymentMethod === "cuenta_corriente" ||
      paymentMethod === "mixto"
    ) {
      setPaymentMethod("efectivo");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickMode]);

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
        const list = (data ?? []) as Store[];
        setStores(list);
        if (list.length > 0 && !selectedStoreId) setSelectedStoreId(list[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cargar cajas (registers)
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

        const list = (data ?? []) as { id: string; name: string }[];
        setRegisters(list);
        setSelectedRegisterId(list.length ? list[0].id : null);
      });
  }, [selectedStoreId]);

  function getUnitPrice(p: ProductRow) {
    return Number((p.effective_price ?? p.price ?? 0) as any);
  }

  function calcLineTotal(it: {
    qty: number;
    unit_price: number;
    is_weighted?: boolean;
  }) {
    if (it.is_weighted) return (it.unit_price * it.qty) / 1000;
    return it.qty * it.unit_price;
  }

  const total = useMemo(
    () => items.reduce((sum, it) => sum + calcLineTotal(it as any), 0),
    [items]
  );
  const formattedTotal = total.toFixed(2);

  const cashGivenNum = Number(String(cashGivenStr ?? "").replace(",", ".")) || 0;

  // ✅ AUTO: si el método es “uno solo”, por defecto monto = total (y se mantiene actualizado)
  useEffect(() => {
    const t = round2(total);

    if (paymentMethod === "debito") {
      setDebitAmount((prev) => (prev <= 0 ? t : prev));
    }
    if (paymentMethod === "credito") {
      setCreditAmount((prev) => (prev <= 0 ? t : prev));
    }
    if (paymentMethod === "mp") {
      setMpAmount((prev) => (prev <= 0 ? t : prev));
    }
    if (paymentMethod === "cuenta_corriente") {
      setAccountAmount((prev) => (prev <= 0 ? t : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod]);

  // ✅ si cambia el carrito y el método es “uno solo”, ajustamos si el campo estaba igual al total anterior
  const lastAutoTotalRef = useRef<number>(0);
  useEffect(() => {
    const t = round2(total);
    const prevT = lastAutoTotalRef.current;
    lastAutoTotalRef.current = t;

    const approxEq = (a: number, b: number) => Math.abs(a - b) < 0.009;

    if (paymentMethod === "debito" && (debitAmount <= 0 || approxEq(debitAmount, prevT))) setDebitAmount(t);
    if (paymentMethod === "credito" && (creditAmount <= 0 || approxEq(creditAmount, prevT))) setCreditAmount(t);
    if (paymentMethod === "mp" && (mpAmount <= 0 || approxEq(mpAmount, prevT))) setMpAmount(t);
    if (paymentMethod === "cuenta_corriente" && (accountAmount <= 0 || approxEq(accountAmount, prevT))) setAccountAmount(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, paymentMethod]);

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

  const totalItems = items.reduce(
    (sum, it: any) => (it.is_weighted ? sum + 1 : sum + it.qty),
    0
  );

  // =========================
  // SEARCH
  // =========================
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

      if (opts?.autoAddFirst && list.length >= 1) {
        addToCartMaybeWeighted(list[0]);
        setSearch("");
        setResults([]);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    } finally {
      setSearching(false);
    }
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

    setSearch("");
    setResults([]);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function updateQty(product_id: string, qty: number) {
    setItems((prev) => {
      if (qty <= 0) return prev.filter((it) => it.product_id !== product_id);
      return prev.map((it) =>
        it.product_id === product_id ? { ...it, qty } : it
      );
    });
  }

  function removeItem(product_id: string) {
    setItems((prev) => prev.filter((it) => it.product_id !== product_id));
  }

  // =========================
  // CONFIRM
  // =========================
  function canConfirmNow() {
    if (items.length === 0) return false;
    if (missing > 0.00001) return false;
    if (confirmLockRef.current) return false;
    return true;
  }

  function tryConfirmSale() {
    const btn = document.querySelector(
      'button[data-pos-confirm="1"]'
    ) as HTMLButtonElement | null;
    if (btn && !btn.disabled) btn.click();
  }

  // =========================
  // ATAJOS + SCANNER + ENTER
  // =========================
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      const isInput = tag === "input";
      const isTextarea = tag === "textarea";
      const isSelect = tag === "select";
      const isTyping = isInput || isTextarea || isSelect;

      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        if (canConfirmNow()) {
          e.preventDefault();
          tryConfirmSale();
        }
        return;
      }

      if (!isTyping && e.key === "F8") {
        e.preventDefault();
        playBeep(880, 90, 0.15);
        return;
      }

      if (!isTyping) {
        if (scannerTimerRef.current) clearTimeout(scannerTimerRef.current);

        if (e.key === "Enter") {
          const code = scannerBufferRef.current.trim();
          scannerBufferRef.current = "";

          if (code.length >= 3) {
            e.preventDefault();
            setSearch(code);
            playBeep();
            void handleSearch({ term: code, autoAddFirst: true });
            return;
          }

          if (canConfirmNow()) {
            e.preventDefault();
            tryConfirmSale();
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
              void handleSearch({ term: code, autoAddFirst: true });
            }
          }, 80);
        }
      }

      if (isInput && e.key === "Enter") {
        if (document.activeElement === cashInputRef.current) {
          if (canConfirmNow()) {
            e.preventDefault();
            tryConfirmSale();
          }
          return;
        }
        return;
      }

      if (isTyping) return;

      if (e.key === "F3" || e.code === "F3") {
        e.preventDefault();
        setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }

      if (e.key === "F5") {
        e.preventDefault();
        setPaymentMethod("efectivo");
        setTimeout(() => cashInputRef.current?.focus(), 0);
        return;
      }

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

      if (e.key === "F9") {
        e.preventDefault();
        if (canConfirmNow()) tryConfirmSale();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    items,
    missing,
    paymentMethod,
    cashGivenStr,
    debitAmount,
    creditAmount,
    mpAmount,
    accountAmount,
    quickMode,
  ]);

  // =========================
  // UI
  // =========================
  return (
    <div className="mx-auto max-w-6xl p-4">
      {saleFeedback && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="w-[380px] rounded-2xl bg-white p-5 shadow-2xl border">
            <div className="text-center">
              <div className="text-2xl font-bold">✅ VENTA CONFIRMADA</div>
              <div className="mt-1 text-sm text-gray-600">
                {saleFeedback.items} ítems · {paymentLabel(saleFeedback.method)}
              </div>

              <div className="mt-3 rounded-xl border bg-neutral-50 p-3">
                <div className="text-xs text-gray-500">TOTAL</div>
                <div className="text-3xl font-bold">
                  ${saleFeedback.total.toFixed(2)}
                </div>
                {saleFeedback.method === "efectivo" && (
                  <div className="mt-2 text-sm">
                    Vuelto:{" "}
                    <span className="font-semibold">
                      ${saleFeedback.change.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-3 text-xs text-gray-500">
                {quickMode ? "Modo cajero rápido" : "POS"}
              </div>
            </div>
          </div>
        </div>
      )}

      {showPin && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="w-[360px] rounded-xl bg-white p-4 shadow-2xl border">
            <div className="text-lg font-semibold mb-2">PIN supervisor</div>
            <input
              autoFocus
              type="password"
              className="w-full border rounded px-3 py-2"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitPin();
                if (e.key === "Escape") setShowPin(false);
              }}
              placeholder="Ingresá PIN"
            />
            <div className="mt-3 flex gap-2 justify-end">
              <button
                className="px-3 py-2 rounded border"
                onClick={() => setShowPin(false)}
              >
                Cancelar
              </button>
              <button
                className="px-3 py-2 rounded bg-black text-white"
                onClick={submitPin}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <h1 className="text-xl font-semibold">POS — Nueva venta</h1>
          <div className="text-xs text-gray-500 hidden md:block">
            Atajos: <b>Enter</b> confirmar · <b>Ctrl+Enter</b> confirmar ·{" "}
            <b>F3</b> buscar · <b>F5</b> efectivo · <b>F6</b> cancelar ·{" "}
            <b>F9</b> confirmar
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* IZQUIERDA */}
        <div className="lg:col-span-1 space-y-3">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm font-medium mb-3">Sucursal y caja</div>

            <label className="block text-xs text-gray-600 mb-1">Sucursal</label>
            <select
              className="border rounded px-3 py-2 w-full mb-3"
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
              <>
                <label className="block text-xs text-gray-600 mb-1">Caja</label>
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
              </>
            )}
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">Buscar producto</div>
              <div className="text-xs text-gray-500">Escáner: automático</div>
            </div>

            <div className="flex gap-2">
              <input
                ref={searchInputRef}
                type="text"
                placeholder={quickMode ? "Escaneá o escribí (Enter agrega primero)" : "Nombre o SKU"}
                className="border rounded px-3 py-2 flex-1"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleSearch({
                      term: search,
                      autoAddFirst: quickMode ? true : false,
                    });
                  }
                }}
              />
              <button
                onClick={() =>
                  void handleSearch({
                    term: search,
                    autoAddFirst: quickMode ? true : false,
                  })
                }
                disabled={searching}
                className="rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {searching ? "..." : "Buscar"}
              </button>
            </div>

            <div className="mt-3 border rounded-md max-h-72 overflow-auto bg-white">
              {results.length === 0 ? (
                <p className="px-3 py-2 text-sm text-neutral-500">
                  No hay resultados. Buscá por nombre o SKU.
                </p>
              ) : (
                results.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-start justify-between gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-neutral-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className="font-medium text-sm leading-snug line-clamp-2 break-normal"
                          title={p.name}
                        >
                          <HighlightText text={p.name} query={search} />
                        </p>

                        {p.is_weighted ? (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] bg-blue-100 text-blue-800">
                            PESABLE
                          </span>
                        ) : null}

                        {p.has_offer ? (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] bg-green-100 text-green-800">
                            OFERTA
                          </span>
                        ) : null}
                      </div>

                      <p className="text-xs text-neutral-600 mt-0.5">
                        SKU: {p.sku ?? "—"}
                        {" · "}
                        {p.stock !== undefined ? <>Stock: {p.stock ?? "—"}</> : null}
                        {p.stock !== undefined ? " · " : " · "}
                        {p.has_offer ? (
                          <>
                            <span className="font-semibold text-green-700">
                              ${Number(p.effective_price ?? 0).toFixed(2)}
                            </span>{" "}
                            <span className="text-neutral-500 line-through ml-1">
                              ${Number(p.price ?? 0).toFixed(2)}
                            </span>
                          </>
                        ) : (
                          <>${Number(p.price ?? 0).toFixed(2)}</>
                        )}
                      </p>
                    </div>

                    <button
                      onClick={() => addToCartMaybeWeighted(p)}
                      className="shrink-0 rounded border px-3 py-2 text-xs font-medium hover:bg-neutral-100"
                      title="Agregar al carrito"
                    >
                      Agregar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* DERECHA */}
        <div className="lg:col-span-2 space-y-4">
          {/* Carrito */}
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">
                Carrito{" "}
                {totalItems > 0 && (
                  <span className="text-sm text-gray-500">({totalItems} ítems)</span>
                )}
              </h2>

              <div className="inline-flex items-baseline gap-2 rounded-lg bg-neutral-900 text-white px-3 py-2">
                <span className="text-xs font-medium">TOTAL</span>
                <span className="text-xl font-bold">${formattedTotal}</span>
              </div>
            </div>

            <div className="border rounded-md overflow-hidden">
              {items.length === 0 ? (
                <p className="px-3 py-2 text-sm text-neutral-500">
                  Todavía no agregaste productos.
                </p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left bg-gray-50">
                      <th className="py-2 px-2">Producto</th>
                      <th className="py-2 px-2 text-right">Cant.</th>
                      <th className="py-2 px-2 text-right">Precio</th>
                      <th className="py-2 px-2 text-right">Subtotal</th>
                      <th className="py-2 px-2 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.product_id} className="border-b last:border-0">
                        <td className="py-2 px-2">
                          {it.name}
                          {it.has_offer && (
                            <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-green-100 text-green-800">
                              OFERTA
                            </span>
                          )}
                          {(it as any).is_weighted && (
                            <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-blue-100 text-blue-800">
                              PESABLE
                            </span>
                          )}
                        </td>

                        <td className="py-2 px-2">
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

                        <td className="py-2 px-2 text-right">
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

                        <td className="py-2 px-2 text-right">
                          ${calcLineTotal(it as any).toFixed(2)}
                        </td>

                        <td className="py-2 px-2 text-right">
                          <button
                            type="button"
                            className="px-2 py-1 rounded border text-xs text-red-600 hover:bg-red-50"
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
          </div>

          {/* Pago */}
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 mb-3">
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

                  {!quickMode && (
                    <>
                      <option value="credito">Crédito</option>
                      <option value="mp">Mercado Pago</option>
                      <option value="cuenta_corriente">Cuenta corriente</option>
                      <option value="mixto">Mixto (varios métodos)</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* EFECTIVO */}
            {paymentMethod === "efectivo" && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Con cuánto paga (efectivo)</label>
                  <input
                    ref={cashInputRef}
                    type="number"
                    className="w-full rounded-md border px-3 py-3 text-right text-xl"
                    value={cashGivenStr}
                    onChange={(e) => setCashGivenStr(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (canConfirmNow()) {
                          e.preventDefault();
                          tryConfirmSale();
                        }
                      }
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

                {missing > 0 && (
                  <div className="md:col-span-2 text-sm text-red-600">
                    Falta cobrar: ${missing.toFixed(2)}
                  </div>
                )}
              </div>
            )}

            {/* DÉBITO / CRÉDITO / MP / CUENTA */}
            {(paymentMethod === "debito" ||
              paymentMethod === "credito" ||
              paymentMethod === "mp" ||
              paymentMethod === "cuenta_corriente") && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Monto ({paymentLabel(paymentMethod)})
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-md border px-3 py-3 text-right text-xl"
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
                      const v = Number(String(e.target.value).replace(",", "."));
                      const n = Number.isFinite(v) ? v : 0;
                      if (paymentMethod === "debito") setDebitAmount(n);
                      if (paymentMethod === "credito") setCreditAmount(n);
                      if (paymentMethod === "mp") setMpAmount(n);
                      if (paymentMethod === "cuenta_corriente") setAccountAmount(n);
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Estado</label>
                  <div className="w-full rounded border bg-neutral-50 px-3 py-3 text-right text-xl">
                    {missing > 0 ? (
                      <span className="text-red-600">Falta ${missing.toFixed(2)}</span>
                    ) : (
                      <span className="text-green-700">OK</span>
                    )}
                  </div>
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
                      className="w-full rounded-md border px-3 py-2 text-right"
                      value={cashGivenStr}
                      onChange={(e) => setCashGivenStr(e.target.value)}
                      placeholder="0"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">Débito</label>
                    <input
                      type="number"
                      className="w-full rounded-md border px-3 py-2 text-right"
                      value={debitAmount}
                      onChange={(e) => setDebitAmount(Number(String(e.target.value).replace(",", ".")) || 0)}
                      placeholder="0"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">Crédito</label>
                    <input
                      type="number"
                      className="w-full rounded-md border px-3 py-2 text-right"
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(Number(String(e.target.value).replace(",", ".")) || 0)}
                      placeholder="0"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">Mercado Pago</label>
                    <input
                      type="number"
                      className="w-full rounded-md border px-3 py-2 text-right"
                      value={mpAmount}
                      onChange={(e) => setMpAmount(Number(String(e.target.value).replace(",", ".")) || 0)}
                      placeholder="0"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-sm font-medium">Cuenta corriente</label>
                    <input
                      type="number"
                      className="w-full rounded-md border px-3 py-2 text-right"
                      value={accountAmount}
                      onChange={(e) => setAccountAmount(Number(String(e.target.value).replace(",", ".")) || 0)}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="text-sm">
                  <div className="flex justify-between">
                    <span>Total a cobrar:</span>
                    <span className="font-semibold">${total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total cobrado:</span>
                    <span className="font-semibold">${totalPaid.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Vuelto:</span>
                    <span className="font-semibold">${change.toFixed(2)}</span>
                  </div>
                  {missing > 0 && (
                    <div className="mt-1 text-red-600 font-semibold">
                      Falta cobrar: ${missing.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Notas: se ocultan en modo rápido */}
            {!quickMode && (
              <div className="mt-3 space-y-1">
                <label className="text-sm font-medium">Notas</label>
                <textarea
                  rows={2}
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: Pago mixto, datos de tarjeta, cliente de cuenta corriente..."
                />
                <div className="text-xs text-gray-500">
                  Tip: si estás escribiendo, usá <b>Ctrl+Enter</b> para confirmar.
                </div>
              </div>
            )}

            {items.length > 0 && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">
                  Enter confirma (si no estás escribiendo) · Ctrl+Enter confirma siempre
                </div>

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
                    showSaleFeedback({
                      total,
                      method: paymentMethod,
                      change,
                      items: totalItems,
                    });

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
    </div>
  );
}
