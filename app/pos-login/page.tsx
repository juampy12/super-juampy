"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setPosEmployee } from "@/lib/posSession";

export default function PosLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/employee/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, pin }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json?.error || "Error de login");
        return;
      }

      setPosEmployee(json.employee);
window.location.href = "/ventas";
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-6 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Ingreso de caja</h1>
      <p className="text-sm text-neutral-500">Ingresá tu código y PIN.</p>

      <form onSubmit={handleLogin} className="space-y-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-neutral-600">Código</label>
          <input
            className="rounded border px-3 py-2"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-neutral-600">PIN</label>
          <input
            className="rounded border px-3 py-2"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            inputMode="numeric"
            type="password"
          />
        </div>

        <button
          className="rounded bg-emerald-600 text-white px-4 py-2 font-medium disabled:opacity-60"
          disabled={loading || !code || !pin}
        >
          {loading ? "Ingresando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
