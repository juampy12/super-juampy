"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getPosEmployee } from "@/lib/posSession";

type StoreBreakdown = { store_id: string; name: string; total: number };

type Summary = {
  today: { total: number; tickets: number; byStore: StoreBreakdown[] };
  yesterday: { total: number };
  vsYesterdayPct: number | null;
  alerts: { cashDiff: boolean; lowStock: boolean };
};

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}

const CARDS: { href: string; label: string; icon: string; color: string }[] = [
  { href: "/reports", label: "Reportes", icon: "ti-chart-bar", color: "#1A5FA8" },
  { href: "/cierres/historial", label: "Cierres de caja", icon: "ti-calculator", color: "#CC2020" },
  { href: "/inteligencia/control", label: "Inteligencia", icon: "ti-brain", color: "#A8C62A" },
  { href: "/stock", label: "Inventario", icon: "ti-package", color: "#1A5FA8" },
  { href: "/products", label: "Precios", icon: "ti-tag", color: "#CC2020" },
  { href: "/empleados", label: "Gestión", icon: "ti-settings", color: "#A8C62A" },
];

export default function InicioPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [empName, setEmpName] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  // Solo supervisor: cajero se va directo al POS, sin sesión al login.
  useEffect(() => {
    const emp = getPosEmployee();
    if (!emp) {
      router.replace("/pos-login");
      return;
    }
    if (emp.role !== "supervisor") {
      router.replace("/ventas");
      return;
    }
    setEmpName(emp.name);
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/home-summary", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setSummary(data);
      } catch (err) {
        console.error("Error cargando resumen de inicio:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (!ready) return null;

  const pct = summary?.vsYesterdayPct ?? null;
  const isUp = pct != null && pct >= 0;
  const tickets = summary?.today.tickets ?? 0;
  const hasAlerts = Boolean(summary?.alerts.cashDiff || summary?.alerts.lowStock);

  return (
    <main className="space-y-5 p-3 sm:space-y-6 sm:p-4">
      <div>
        <p className="text-sm text-neutral-500">Hola{empName ? `, ${empName}` : ""}</p>
        <h1 className="text-2xl font-semibold sm:text-3xl">Inicio</h1>
      </div>

      {/* Resumen del día */}
      <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Ventas de hoy</div>
            {loading ? (
              <div className="mt-2 h-9 w-40 animate-pulse rounded-lg bg-neutral-200" />
            ) : (
              <div className="mt-1 text-3xl font-bold text-black sm:text-4xl">
                {money(summary?.today.total ?? 0)}
              </div>
            )}
          </div>
          {!loading && pct != null && (
            <div
              className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium ${
                isUp ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              }`}
            >
              <i className={`ti ${isUp ? "ti-trending-up" : "ti-trending-down"}`} aria-hidden="true" />
              {isUp ? "+" : ""}
              {pct}%
            </div>
          )}
        </div>

        {!loading && (
          <div className="mt-2 text-xs text-neutral-500">
            {tickets} ticket{tickets === 1 ? "" : "s"} hoy
            {pct != null && " · vs. ayer"}
          </div>
        )}

        {/* Desglose por sucursal */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {loading
            ? [0, 1, 2].map((i) => (
                <div key={i} className="rounded-2xl bg-neutral-50 p-3">
                  <div className="h-3 w-12 animate-pulse rounded bg-neutral-200" />
                  <div className="mt-2 h-4 w-16 animate-pulse rounded bg-neutral-200" />
                </div>
              ))
            : (summary?.today.byStore ?? []).map((s) => (
                <div key={s.store_id} className="rounded-2xl bg-neutral-50 p-3">
                  <div className="truncate text-xs font-medium text-neutral-500">{s.name}</div>
                  <div className="mt-1 truncate text-sm font-semibold text-black sm:text-base">
                    {money(s.total)}
                  </div>
                </div>
              ))}
        </div>

        {/* Alertas discretas */}
        {!loading && hasAlerts && (
          <div className="mt-4 flex flex-col gap-1.5 border-t border-neutral-100 pt-3">
            {summary?.alerts.cashDiff && (
              <Link
                href="/inteligencia/diferencias"
                className="flex items-center gap-1.5 text-xs font-medium text-amber-700"
              >
                <i className="ti ti-alert-triangle" aria-hidden="true" />
                Hay una diferencia de caja reciente para revisar
              </Link>
            )}
            {summary?.alerts.lowStock && (
              <Link
                href="/stock-bajo"
                className="flex items-center gap-1.5 text-xs font-medium text-amber-700"
              >
                <i className="ti ti-alert-triangle" aria-hidden="true" />
                Hay stock crítico en algún producto
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Menú de tarjetas */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="flex min-h-[104px] flex-col items-start justify-between gap-3 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm transition-transform active:scale-[0.98] sm:p-5"
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl"
              style={{ background: `${c.color}1a`, color: c.color }}
            >
              <i className={`ti ${c.icon}`} aria-hidden="true" />
            </span>
            <span className="text-sm font-medium text-black sm:text-base">{c.label}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
