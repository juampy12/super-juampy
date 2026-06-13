"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import toast from "react-hot-toast";
import ConfirmSaleButton from "@/components/ConfirmSaleButton";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { getPosEmployee } from "@/lib/posSession";
import { addToQueue } from "@/lib/offlineQueue";
import { warmCache, searchCachedProducts, mergeIntoCachedProducts, initProductCache, getCacheSavedAt } from "@/lib/productCache";
import { useOnlineSync } from "@/lib/useOnlineSync";
import { getHolds, saveHold, removeHold, type Hold } from "@/app/ventas/lib/hold";

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
  active?: boolean | null;
};

type CartItem = {
  product_id: string;
  lineId?: string;      // único por línea; para balanza permite varias líneas del mismo producto
  name: string;
  sku: string | null;
  qty: number;
  unit_price: number;
  base_unit_price?: number;
  has_offer?: boolean;
  is_weighted?: boolean;
  is_balanza?: boolean; // precio viene de la etiqueta de balanza, qty siempre 1
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
          <mark key={i} className="rounded px-1 bg-red-100 text-red-900">
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

// Detecta EAN-13 de balanza: primer dígito "2", 13 dígitos total.
// Retorna PLU (5 dígitos tal cual, ej "00009") y precio en pesos.
function parseBalanzaBarcode(code: string): { plu: string; price: number } | null {
  if (code.length !== 13 || code[0] !== "2") return null;
  const plu = code.substring(1, 6);            // dígitos 2-6
  const priceRaw = parseInt(code.substring(6, 11), 10); // dígitos 7-11
  if (!Number.isFinite(priceRaw)) return null;
  const price = priceRaw / 10;                 // 37800 → $3780.00
  return { plu, price };
}

// ── Tipos y utilidades para ventas recientes / anulación desde POS ──────────

type RecentSale = {
  id: string;
  created_at: string;
  total: number;
  method: string;
  status: string;
  voided_at: string | null;
};

function formatSaleTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

type PosVoidModalProps = {
  sale: RecentSale;
  storeName: string;
  onClose: () => void;
  onVoided: () => void;
};

function PosVoidModal({ sale, storeName, onClose, onVoided }: PosVoidModalProps) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim()) { setError("Ingresá el PIN de supervisor"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sales/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sale_id: sale.id, pin: pin.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Error al anular la venta");
        return;
      }
      toast.success("Venta anulada");
      onVoided();
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold mb-1">Anular venta</h2>
        <p className="text-sm text-neutral-500 mb-4">
          Esta acción devuelve el stock y marca la venta como anulada. No se puede deshacer.
        </p>
        <div className="rounded-xl border bg-neutral-50 p-3 mb-4 text-sm space-y-1">
          <div className="text-neutral-500 text-xs">Venta a anular</div>
          <div className="font-medium">{formatSaleTime(sale.created_at)}</div>
          <div className="text-neutral-600">{storeName} · ${sale.total.toFixed(2)}</div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">
              PIN de supervisor
            </label>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(null); }}
              className="w-full rounded-lg border px-3 py-2 text-lg tracking-widest text-center"
              placeholder="••••"
              disabled={loading}
              maxLength={10}
              autoComplete="off"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !pin.trim()}
              className="flex-1 rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? "Anulando…" : "Confirmar anulación"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── POS Principal ─────────────────────────────────────────────────────────────

export default function VentasPage() {
  const quickMode = false;
  const router = useRouter();

  useEffect(() => {
    const emp = getPosEmployee();
    if (!emp) router.replace("/pos-login");
  }, [router]);

  // ================= ROLES POS =================
  type Role = "cajero" | "supervisor";

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

  async function submitPin() {
    try {
      const res = await fetch("/api/employee/verify-supervisor-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (json.ok) {
        setRole("supervisor");
        setShowPin(false);
        const fn = pendingActionRef.current;
        pendingActionRef.current = null;
        if (fn) fn();
      } else {
        toast.error("PIN incorrecto");
        setPinInput("");
      }
    } catch {
      toast.error("Error verificando PIN");
      setPinInput("");
    }
  }

  function cancelSale() {
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
    setShowCancelConfirm(false);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function holdCart() {
    if (items.length === 0) { toast.error("El carrito está vacío."); return; }
    saveHold(items.map(it => ({
      product_id: it.product_id,
      name: it.name,
      sku: it.sku,
      qty: it.qty,
      unit_price: it.unit_price,
      is_weighted: it.is_weighted,
    })), total);
    setHolds(getHolds());
    setItems([]);
    setSearch("");
    setResults([]);
  }

  function resumeHold(hold: Hold) {
    if (items.length > 0) {
      if (!window.confirm("Hay productos en el carrito. ¿Querés reemplazarlo con la venta en espera?")) return;
    }
    setItems(hold.items.map(it => ({
      product_id: it.product_id,
      name: it.name,
      sku: it.sku,
      qty: it.qty,
      unit_price: it.unit_price,
      base_unit_price: it.unit_price,
      is_weighted: it.is_weighted ?? false,
    })));
    removeHold(hold.id);
    setHolds(getHolds());
    setShowHolds(false);
  }

  function deleteHold(id: string) {
    removeHold(id);
    setHolds(getHolds());
  }

  async function loadRecentSales() {
    if (!selectedRegisterId) return;
    try {
      setRecentSalesLoading(true);
      const res = await fetch(
        `/api/sales/recent?register_id=${selectedRegisterId}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Error");
      setRecentSales(
        (json.data ?? []).map((r: any) => ({
          id: r.id,
          created_at: r.created_at,
          total: Number(r.total ?? 0),
          method: r.payment?.method ?? "desconocido",
          status: r.status ?? "confirmed",
          voided_at: r.payment?.voided_at ?? null,
        }))
      );
    } catch {
      toast.error("No se pudieron cargar las ventas recientes");
    } finally {
      setRecentSalesLoading(false);
    }
  }

  function lockSupervisor() {
    setRole("cajero");
    if (typeof window !== "undefined") localStorage.removeItem("pos_role");
  }

  // ================= D) MODO CAJERO RÁPIDO =================

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
      if (!ctx) return;

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

  async function handleBalanzaBarcode(plu: string, price: number) {
    const pluInt = String(parseInt(plu, 10)); // "00009" → "9"
    try {
      const res = await fetch(`/api/products/by-plu?plu=${encodeURIComponent(pluInt)}`);
      const json = await res.json();
      if (!json.product) {
        toast.error("Producto no encontrado. Configurá el PLU en el catálogo");
        setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }
      const p = json.product;
      const lineId = `${p.id}:${Date.now()}`;
      setItems((prev) => [
        ...prev,
        {
          product_id: p.id,
          lineId,
          name: p.name,
          sku: p.sku ?? null,
          qty: 1,
          unit_price: price,
          base_unit_price: price,
          has_offer: false,
          is_balanza: true,
        },
      ]);
      playBeep(880, 100, 0.15);
      toast.success(`${p.name} — $${price.toFixed(2)}`);
    } catch {
      toast.error("Error buscando producto de balanza");
    }
    setTimeout(() => searchInputRef.current?.focus(), 0);
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
    saleId?: string | null;
  }>(null);

  const confirmLockRef = useRef(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showSaleFeedback(payload: {
    total: number;
    method: PaymentMethod;
    change: number;
    items: number;
    saleId?: string | null;
  }) {
    setSaleFeedback({ ...payload, at: Date.now() });
    confirmLockRef.current = true;

    setTimeout(() => {
      confirmLockRef.current = false;
    }, 650);

    // Auto-cierre del feedback en 2.5s
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      setSaleFeedback(null);
      feedbackTimerRef.current = null;
    }, 2500);
  }

  function closeSaleFeedback() {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    setSaleFeedback(null);
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
  const [selectedResultIdx, setSelectedResultIdx] = useState(-1);
  const resultItemRefs = useRef<(HTMLDivElement | null)[]>([]);
  // true solo cuando el usuario usó ↑/↓ o hover para elegir un resultado
  const hasNavigatedRef = useRef(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [showHolds, setShowHolds] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showRecentSales, setShowRecentSales] = useState(false);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [recentSalesLoading, setRecentSalesLoading] = useState(false);
  const [voidTarget, setVoidTarget] = useState<RecentSale | null>(null);

  useEffect(() => {
    setHolds(getHolds());
  }, []);

  // Selecciona el primer resultado automáticamente cuando cambia la lista
  useEffect(() => {
    setSelectedResultIdx(results.length > 0 ? 0 : -1);
    resultItemRefs.current = resultItemRefs.current.slice(0, results.length);
    hasNavigatedRef.current = false; // nueva búsqueda = sin navegación activa
  }, [results]);

  // Scroll al ítem seleccionado cuando cambia el índice
  useEffect(() => {
    if (selectedResultIdx >= 0) {
      resultItemRefs.current[selectedResultIdx]?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedResultIdx]);

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

  // store_id fijo del empleado logueado (null = supervisor, ve todas)
  const selectedStoreIdRef = useRef<string | null>(null);
  const [cacheSyncedAt, setCacheSyncedAt] = useState<number | null>(null);
  const { isOnline, pendingCount, syncing, sync, updatePending } = useOnlineSync(() => {
    if (selectedStoreIdRef.current) {
      void warmCache(selectedStoreIdRef.current).then(() => {
        const sid = selectedStoreIdRef.current;
        if (sid) setCacheSyncedAt(getCacheSavedAt(sid));
      });
    }
  });
  const isOnlineRef = useRef(true);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);
  useEffect(() => { selectedStoreIdRef.current = selectedStoreId; }, [selectedStoreId]);
  const empStoreId = getPosEmployee()?.store_id ?? null;
  const empRegisterId = getPosEmployee()?.register_id ?? null;
  const isSupervisorRole = (getPosEmployee()?.role ?? "") === "supervisor";

  // Cargar sucursales
  useEffect(() => {
    supabase
      .from("stores")
      .select("id,name")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          toast.error("Error cargando sucursales: " + error.message);
          return;
        }
        const list = (data ?? []) as Store[];
        setStores(list);
        // Si el empleado tiene sucursal asignada, usar esa
        // Si es supervisor (sin restricción), usar la primera
        const defaultStore = empStoreId ?? list[0]?.id ?? null;
        if (!selectedStoreId) setSelectedStoreId(defaultStore);
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
    // Cargar IDB en memoria (funciona offline también)
    setCacheSyncedAt(null);
    void initProductCache(selectedStoreId).then(() => {
      setCacheSyncedAt(getCacheSavedAt(selectedStoreId));
    });
    // Actualizar cache desde Supabase cuando hay conexión
    if (isOnline) {
      void warmCache(selectedStoreId).then(() => {
        setCacheSyncedAt(getCacheSavedAt(selectedStoreId));
      });
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
          toast.error("Error cargando cajas: " + error.message);
          return;
        }

        const list = (data ?? []) as { id: string; name: string }[];
        setRegisters(list);
        // Si el empleado tiene caja asignada y existe en esta sucursal, usarla
        const matchedRegister = empRegisterId ? list.find(r => r.id === empRegisterId) : null;
        setSelectedRegisterId(matchedRegister?.id ?? (list.length ? list[0].id : null));
      });
  }, [selectedStoreId]);

  function getUnitPrice(p: ProductRow) {
    return Number((p.effective_price ?? p.price ?? 0) as any);
  }
function sortResultsForTerm(list: ProductRow[], termRaw: string) {
  const term = (termRaw ?? "").trim();
  if (!term) return list;

  const termLower = term.toLowerCase();

  function rank(p: ProductRow) {
    const sku = (p.sku ?? "").trim();
    const name = (p.name ?? "").toLowerCase();

    // 0) match exacto por SKU (lo que queremos para 4003)
    if (sku === term) return 0;

    // 1) SKU empieza con term (útil si usan prefijos internos)
    if (sku.startsWith(term)) return 1;

    // 2) SKU contiene term (caso 7798...4003)
    if (sku.includes(term)) return 2;

    // 3) nombre contiene term
    if (name.includes(termLower)) return 3;

    // 4) resto
    return 4;
  }

  return [...list].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });
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
async function handleSearch(opts?: {
  term?: string;
  autoAddFirst?: boolean;
  source?: "scanner" | "manual";
}) {
    const term = (opts?.term ?? search).trim();

    if (!term) {
      toast("Escribí nombre o SKU para buscar.");
      return;
    }
    if (!selectedStoreId) {
      toast("Elegí una sucursal antes de buscar.");
      return;
    }

    if (!isOnlineRef.current) {
      const cached = searchCachedProducts(selectedStoreId, term);
      if (cached.length > 0) {
        setResults(cached as any);
      } else {
        toast.error("Sin conexión. No hay productos en cache. Conectate a internet primero para cargar el cache.");
      }
      setSearching(false);
      return;
    }

    setSearching(true);
    try {
      let data: any[] | null = null;
      let fetchError: any = null;
      try {
        const res = await fetch("/api/products/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ store_id: selectedStoreId, query: term || null, limit: 100 }),
        });
        if (!res.ok) { fetchError = { message: `${res.status}` }; }
        else { data = await res.json(); }
      } catch {
        fetchError = { message: "Sin conexión" };
      }
      if (fetchError) {
        const cached = searchCachedProducts(selectedStoreId, term);
        if (cached.length > 0) {
          setResults(cached as any);
          setSearching(false);
          return;
        }
        toast.error("Sin conexión y sin cache disponible. Conectate a internet para buscar productos.");
        return;
      }
const list = (data ?? []) as ProductRow[];
const activeList = list.filter((p) => p.active !== false);

const ordered = sortResultsForTerm(activeList, term);
setResults(ordered);
// Guardar resultados en cache para uso offline
if (selectedStoreId) mergeIntoCachedProducts(selectedStoreId, activeList as any);

if (opts?.autoAddFirst && ordered.length >= 1) {
  const is4Digits = /^\d{4}$/.test(term);
  const isBarcode = /^\d{6,}$/.test(term); // barcode real

  // CASO SCANNER: solo agrega si hay match exacto
  if (opts?.source === "scanner" && isBarcode) {
    const exact = ordered.find(
      (p) => String(p.sku ?? "").trim() === term
    );

    if (exact) {
      addToCartMaybeWeighted(exact);
      setSearch("");
      setResults([]);
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } else {
      // no agrega nada si no hay match exacto
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }

    return;
  }

  // CASO MANUAL
  const pick = is4Digits
    ? ordered.find((p) => String(p.sku ?? "").trim() === term)
    : ordered[0];

  if (pick) {
    addToCartMaybeWeighted(pick);
    setSearch("");
    setResults([]);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }
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
        toast.error("Gramos inválidos");
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
          toast.error("Gramos inválidos");
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

  function lineKey(it: CartItem) {
    return it.lineId ?? it.product_id;
  }

  function updateQty(key: string, qty: number) {
    setItems((prev) => {
      if (qty <= 0) return prev.filter((it) => lineKey(it) !== key);
      return prev.map((it) => lineKey(it) === key ? { ...it, qty } : it);
    });
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => lineKey(it) !== key));
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

        if (e.key === "ArrowDown" && results.length > 0) {
          e.preventDefault();
          hasNavigatedRef.current = true;
          setSelectedResultIdx((i) => Math.min(i + 1, results.length - 1));
          return;
        }

        if (e.key === "ArrowUp" && results.length > 0) {
          e.preventDefault();
          hasNavigatedRef.current = true;
          setSelectedResultIdx((i) => Math.max(i - 1, 0));
          return;
        }

        if (e.key === "Enter") {
          const code = scannerBufferRef.current.trim();
          scannerBufferRef.current = "";

if (code.length >= 6) {
            e.preventDefault();
            const balanza = parseBalanzaBarcode(code);
            if (balanza) {
              void handleBalanzaBarcode(balanza.plu, balanza.price);
              return;
            }
            setSearch(code);
            playBeep();
void handleSearch({ term: code, autoAddFirst: true, source: "scanner" });
            return;
          }

          // Agrega al carrito solo si el usuario navegó con flechas o hover
          if (hasNavigatedRef.current && results.length > 0 && selectedResultIdx >= 0) {
            e.preventDefault();
            addToCartMaybeWeighted(results[selectedResultIdx]);
            setSearch("");
            setResults([]);
            setTimeout(() => searchInputRef.current?.focus(), 0);
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
              const balanza = parseBalanzaBarcode(code);
              if (balanza) {
                void handleBalanzaBarcode(balanza.plu, balanza.price);
                return;
              }
              setSearch(code);
              playBeep();
void handleSearch({ term: code, autoAddFirst: true, source: "scanner" });
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

      if (e.key === "/" || e.key === "F3" || e.code === "F3") {
        e.preventDefault();
        setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }

      if (e.key === "F2") {
        e.preventDefault();
        setPaymentMethod("efectivo");
        setTimeout(() => cashInputRef.current?.focus(), 0);
        return;
      }

      if (e.key === "F6" || e.key === "F2" && e.shiftKey) {
        e.preventDefault();
        if (items.length === 0) return;
        setShowCancelConfirm(true);
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
        if (last) removeItem(lineKey(last));
        return;
      }

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        const last = items[items.length - 1];
        if (last) updateQty(lineKey(last), last.qty + 1);
        return;
      }

      if (e.key === "-") {
        e.preventDefault();
        const last = items[items.length - 1];
        if (last) updateQty(lineKey(last), last.qty - 1);
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
    results,
    selectedResultIdx,
  ]);

  // =========================
  // UI
  // =========================
  return (
    <div className="mx-auto max-w-6xl p-4">
      {saleFeedback && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border">
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
                {quickMode ? "Modo cajero rápido" : "POS"} · Se cierra automáticamente
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  className="flex-1 rounded-lg border px-3 py-2 text-sm"
                  onClick={closeSaleFeedback}
                >
                  Cerrar
                </button>
                <button
                  className="flex-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white"
                  onClick={async () => {
                    closeSaleFeedback();
                    const { exportReceiptPDF } = await import("@/app/_utils/receipt");
                    await exportReceiptPDF({
                      saleId: saleFeedback.saleId ?? undefined,
                      storeName: stores.find(s => s.id === selectedStoreId)?.name ?? "Super Juampy",
                      items: items.map(it => ({
                        name: it.name,
                        qty: it.qty,
                        price: it.unit_price,
                        subtotal: it.qty * it.unit_price,
                      })),
                      payMethod: saleFeedback.method,
                      amount: saleFeedback.total,
                      change: saleFeedback.change,
                      total: saleFeedback.total,
                    });
                  }}
                >
                  🖨️ Imprimir ticket
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="w-[340px] rounded-2xl bg-white p-6 shadow-2xl border">
            <h2 className="text-lg font-semibold mb-2">¿Cancelar venta?</h2>
            <p className="text-sm text-gray-500 mb-6">Se va a limpiar el carrito y todos los datos del pago.</p>
            <div className="flex gap-3">
              <button
                className="flex-1 rounded-lg border px-4 py-2 text-sm"
                onClick={() => setShowCancelConfirm(false)}
              >
                Volver
              </button>
              <button
                className="flex-2 rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700"
                onClick={cancelSale}
              >
                Sí, cancelar
              </button>
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
                className="px-3 py-2 rounded text-white" style={{background:"#CC2020"}}
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
            Atajos: <b>/</b> buscar · <b>F2</b> efectivo · <b>Escape</b> cancelar · <b>Ctrl+Enter</b> confirmar
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {!isOnline && (
            <div className="rounded-lg bg-red-100 border border-red-300 px-3 py-2 text-sm font-medium text-red-800 flex items-center gap-1">
              📵 Sin conexión{cacheSyncedAt && selectedStoreId
                ? ` — productos del ${new Date(cacheSyncedAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </div>
          )}
          {isOnline && pendingCount > 0 && (
            <button
              onClick={sync}
              disabled={syncing}
              className="rounded-lg bg-orange-100 border border-orange-300 px-3 py-2 text-sm font-medium text-orange-800 hover:bg-orange-200"
            >
              {syncing ? "⏳ Sincronizando..." : `⚠️ ${pendingCount} pendiente${pendingCount > 1 ? "s" : ""}`}
            </button>
          )}
          {isOnline && pendingCount === 0 && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
              🟢 Online
            </div>
          )}
          <button
            onClick={holdCart}
            className="rounded-lg border px-3 py-2 text-sm font-medium bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
            title="Poner carrito en espera"
          >
            ⏸ En espera
          </button>
          <button
            onClick={() => {
              setShowRecentSales(true);
              void loadRecentSales();
            }}
            className="rounded-lg border px-3 py-2 text-sm font-medium bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
            title="Ver últimas ventas del día de esta caja"
          >
            🧾 Últimas ventas
          </button>
          {holds.length > 0 && (
            <button
              onClick={() => setShowHolds(true)}
              className="rounded-lg border px-3 py-2 text-sm font-medium bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100"
            >
              📋 Retomar ({holds.length})
            </button>
          )}
        </div>
      </div>

      {showHolds && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="w-[420px] rounded-2xl bg-white p-5 shadow-2xl border max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Ventas en espera</h2>
              <button onClick={() => setShowHolds(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            {holds.length === 0 ? (
              <p className="text-sm text-gray-500">No hay ventas en espera.</p>
            ) : (
              <div className="space-y-3">
                {holds.map((h) => (
                  <div key={h.id} className="border rounded-xl p-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">${h.total.toFixed(2)} · {h.items.length} producto{h.items.length !== 1 ? "s" : ""}</div>
                      <div className="text-xs text-gray-500">{new Date(h.savedAt).toLocaleTimeString("es-AR")}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => resumeHold(h)} className="rounded-lg bg-green-600 text-white px-3 py-1 text-sm font-medium hover:bg-green-700">
                        Retomar
                      </button>
                      <button onClick={() => deleteHold(h.id)} className="rounded-lg border px-3 py-1 text-sm text-red-600 hover:bg-red-50">
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {voidTarget && (
        <PosVoidModal
          sale={voidTarget}
          storeName={stores.find((s) => s.id === selectedStoreId)?.name ?? "—"}
          onClose={() => setVoidTarget(null)}
          onVoided={() => {
            setVoidTarget(null);
            void loadRecentSales();
          }}
        />
      )}

      {showRecentSales && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-5 pb-3">
              <div>
                <h2 className="text-lg font-semibold">Ventas del día</h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {registers.find((r) => r.id === selectedRegisterId)?.name ?? "Esta caja"} · hoy
                </p>
              </div>
              <button
                onClick={() => setShowRecentSales(false)}
                className="text-gray-400 hover:text-gray-600 text-xl ml-4"
              >
                ✕
              </button>
            </div>

            <div className="px-5 pb-2 flex justify-end">
              <button
                onClick={loadRecentSales}
                disabled={recentSalesLoading}
                className="text-xs text-blue-600 hover:underline disabled:opacity-50"
              >
                {recentSalesLoading ? "Cargando…" : "Actualizar"}
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 pb-3">
              {recentSalesLoading && recentSales.length === 0 ? (
                <p className="text-sm text-neutral-500 py-6 text-center">Cargando ventas…</p>
              ) : recentSales.length === 0 ? (
                <p className="text-sm text-neutral-500 py-6 text-center">No hay ventas hoy en esta caja.</p>
              ) : (
                <div className="space-y-1.5">
                  {recentSales.map((sale) => {
                    const isVoided = sale.status === "anulada";
                    return (
                      <div
                        key={sale.id}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm ${isVoided ? "opacity-50 bg-neutral-50" : "bg-white"}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className={`flex flex-wrap items-center gap-2 ${isVoided ? "line-through text-neutral-400" : ""}`}>
                            <span className="font-semibold tabular-nums">{formatSaleTime(sale.created_at)}</span>
                            <span className="text-neutral-400">·</span>
                            <span className="font-bold">${sale.total.toFixed(2)}</span>
                            <span className="text-neutral-400">·</span>
                            <span className="text-neutral-500 text-xs">{paymentLabel(sale.method as any)}</span>
                          </div>
                          {isVoided && (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 mt-1">
                              ANULADA
                            </span>
                          )}
                        </div>
                        {!isVoided && (
                          <button
                            type="button"
                            onClick={() => setVoidTarget(sale)}
                            className="ml-3 shrink-0 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100"
                          >
                            Anular
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {recentSales.length > 0 && (
              <div className="border-t px-5 py-3 flex justify-between text-xs text-neutral-500 bg-neutral-50 rounded-b-2xl">
                <span>{recentSales.filter((s) => s.status === "confirmed").length} confirmadas</span>
                {recentSales.some((s) => s.status === "anulada") && (
                  <span className="text-red-600">
                    {recentSales.filter((s) => s.status === "anulada").length} anulada{recentSales.filter((s) => s.status === "anulada").length !== 1 ? "s" : ""}
                  </span>
                )}
                <span className="font-medium text-neutral-700">
                  Total: ${recentSales.filter((s) => s.status === "confirmed").reduce((acc, s) => acc + s.total, 0).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* IZQUIERDA */}
        <div className="lg:col-span-1 space-y-3">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm font-medium mb-3">Sucursal y caja</div>

            <label className="block text-xs text-gray-600 mb-1">Sucursal</label>
            {isSupervisorRole ? (
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
            ) : (
              <div className="border rounded px-3 py-2 w-full mb-3 bg-gray-50 text-sm font-medium">
                {stores.find(s => s.id === selectedStoreId)?.name ?? "Cargando..."}
              </div>
            )}

            {registers.length > 0 && (
              <>
                <label className="block text-xs text-gray-600 mb-1">Caja</label>
                {isSupervisorRole ? (
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
                ) : (
                  <div className="border rounded px-3 py-2 w-full bg-gray-50 text-sm font-medium">
                    {registers.find(r => r.id === selectedRegisterId)?.name ?? "Cargando..."}
                  </div>
                )}
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
                onChange={(e) => { setSearch(e.target.value); hasNavigatedRef.current = false; }}
onKeyDown={(e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (results.length > 0) {
      hasNavigatedRef.current = true;
      setSelectedResultIdx((i) => Math.min(i + 1, results.length - 1));
    }
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    if (results.length > 0) {
      hasNavigatedRef.current = true;
      setSelectedResultIdx((i) => Math.max(i - 1, 0));
    }
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();

    // Agrega al carrito solo si el usuario navegó con flechas o hover
    if (hasNavigatedRef.current && results.length > 0 && selectedResultIdx >= 0) {
      addToCartMaybeWeighted(results[selectedResultIdx]);
      setSearch("");
      setResults([]);
      setTimeout(() => searchInputRef.current?.focus(), 0);
      return;
    }

    const term = search.trim();
    const isOwn4DigitSku = /^\d{4}$/.test(term); // SOLO 4 dígitos

    void handleSearch({
      term,
      autoAddFirst: quickMode ? true : isOwn4DigitSku,
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
                className="rounded px-3 py-2 text-sm font-medium text-white disabled:opacity-60 flex items-center gap-1.5" style={{background:"#CC2020"}}
              >
                {searching ? (
                  <>
                    <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity=".25"/>
                      <path fill="currentColor" opacity=".75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Buscando
                  </>
                ) : "Buscar"}
              </button>
            </div>

            <div className="mt-3 border rounded-md max-h-72 overflow-auto bg-white">
              {results.length === 0 ? (
                <p className="px-3 py-2 text-sm text-neutral-500">
                  No hay resultados. Buscá por nombre o SKU.
                </p>
              ) : (
                results.map((p, idx) => {
                  const isSelected = idx === selectedResultIdx;
                  return (
                  <div
                    key={p.id}
                    ref={(el) => { resultItemRefs.current[idx] = el; }}
                    className="flex items-start justify-between gap-3 border-b px-3 py-2 last:border-b-0 cursor-default"
                    style={isSelected ? { background: "#1A5FA8", color: "#fff" } : undefined}
                    onMouseEnter={() => { hasNavigatedRef.current = true; setSelectedResultIdx(idx); }}
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
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${isSelected ? "bg-white/20 text-white" : "bg-blue-100 text-blue-800"}`}>
                            PESABLE
                          </span>
                        ) : null}

                        {p.has_offer ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${isSelected ? "bg-white/20 text-white" : "bg-green-100 text-green-800"}`}>
                            OFERTA
                          </span>
                        ) : null}
                      </div>

                      <p className={`text-xs mt-0.5 ${isSelected ? "text-white/80" : "text-neutral-600"}`}>
                        SKU: {p.sku ?? "—"}
                        {" · "}
                        {p.stock !== undefined ? <>Stock: {p.stock ?? "—"}</> : null}
                        {p.stock !== undefined ? " · " : " · "}
                        {p.has_offer ? (
                          <>
                            <span className={`font-semibold ${isSelected ? "text-white" : "text-green-700"}`}>
                              ${Number(p.effective_price ?? 0).toFixed(2)}
                            </span>{" "}
                            <span className={`line-through ml-1 ${isSelected ? "text-white/60" : "text-neutral-500"}`}>
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
                      className={`shrink-0 rounded border px-3 py-2 text-xs font-medium ${isSelected ? "border-white/40 text-white hover:bg-white/10" : "hover:bg-neutral-100"}`}
                      title="Agregar al carrito"
                    >
                      Agregar
                    </button>
                  </div>
                  );
                })
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

              <div className="inline-flex items-baseline gap-2 rounded-lg text-white px-3 py-2" style={{background:"#1A5FA8"}}>
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
                      <tr key={lineKey(it)} className="border-b last:border-0">
                        <td className="py-2 px-2">
                          {it.name}
                          {it.has_offer && (
                            <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-green-100 text-green-800">
                              OFERTA
                            </span>
                          )}
                          {(it as any).is_weighted && !(it as any).is_balanza && (
                            <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-blue-100 text-blue-800">
                              PESABLE
                            </span>
                          )}
                          {(it as any).is_balanza && (
                            <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-purple-100 text-purple-800">
                              BALANZA
                            </span>
                          )}
                        </td>

                        <td className="py-2 px-2">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              className="px-4 py-2 min-w-[44px] min-h-[44px] rounded border text-sm"
                              onClick={() => {
                                if ((it as any).is_balanza) return; // precio fijo de etiqueta
                                if ((it as any).is_weighted) {
                                  const gramsStr = window.prompt(
                                    `Restar gramos a: ${it.name}`,
                                    "50"
                                  );
                                  if (!gramsStr) return;
                                  const grams = Number(String(gramsStr).replace(",", "."));
                                  if (!Number.isFinite(grams) || grams <= 0) return;
                                  updateQty(lineKey(it), it.qty - grams);
                                  return;
                                }
                                updateQty(lineKey(it), it.qty - 1);
                              }}
                              disabled={(it as any).is_balanza}
                            >
                              -
                            </button>

                            <span className="w-16 text-center">
                              {(it as any).is_balanza
                                ? "1"
                                : (it as any).is_weighted
                                ? `${it.qty} g`
                                : it.qty}
                            </span>

                            <button
                              type="button"
                              className="px-4 py-2 min-w-[44px] min-h-[44px] rounded border text-sm"
                              onClick={() => {
                                if ((it as any).is_balanza) return; // precio fijo de etiqueta
                                if ((it as any).is_weighted) {
                                  const gramsStr = window.prompt(
                                    `Sumar gramos a: ${it.name}`,
                                    "50"
                                  );
                                  if (!gramsStr) return;
                                  const grams = Number(String(gramsStr).replace(",", "."));
                                  if (!Number.isFinite(grams) || grams <= 0) return;
                                  updateQty(lineKey(it), it.qty + grams);
                                  return;
                                }
                                updateQty(lineKey(it), it.qty + 1);
                              }}
                              disabled={(it as any).is_balanza}
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
                            className="px-3 py-2 min-w-[44px] min-h-[44px] rounded border text-sm text-red-600 hover:bg-red-50"
                            onClick={() => removeItem(lineKey(it))}
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
                  onConfirmed={(saleId) => {
                    showSaleFeedback({
                      total,
                      method: paymentMethod,
                      change,
                      items: totalItems,
                      saleId,
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
                  storeName={stores.find(s => s.id === selectedStoreId)?.name ?? "Super Juampy"}
                  isOnline={isOnline}
                  onQueued={updatePending}
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
