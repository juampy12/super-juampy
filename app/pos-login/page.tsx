"use client";

import { useState } from "react";
import { setPosEmployee, markOfflineSession } from "@/lib/posSession";
import { isMobileViewport } from "@/lib/useIsMobile";
import { saveOfflineCredential, verifyOfflineCredential, setPendingReauth, isOfflineLoginLocked } from "@/lib/offlineAuth";
import toast from "react-hot-toast";

export default function PosLoginPage() {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      let res: Response;
      try {
        res = await fetch("/api/employee/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, pin }),
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        // El fetch falló por red (sin conexión o timeout), no por credenciales
        // inválidas — intentar el login offline de emergencia contra las
        // credenciales guardadas en esta máquina.
        if (isOfflineLoginLocked(code)) {
          toast.error("Demasiados intentos. Esperá 15 minutos e intentá de nuevo.");
          return;
        }
        const employee = await verifyOfflineCredential(code, pin);
        if (!employee) {
          toast.error("Sin conexión: solo puede entrar el último cajero que usó esta caja");
          return;
        }
        setPosEmployee(employee);
        markOfflineSession();
        setPendingReauth(code, pin);
        toast("Modo sin conexión — las ventas se guardarán y sincronizarán al volver internet", {
          icon: "📵",
          duration: 6000,
        });
        window.location.href = "/ventas";
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json?.error || "Codigo o PIN incorrecto"); return; }
      setPosEmployee(json.employee);
      await saveOfflineCredential(code, pin, json.employee);
      // Supervisor en mobile: el POS no es su pantalla de trabajo — arranca en su panel de inicio.
      const isSupervisorOnMobile = json.employee?.role === "supervisor" && isMobileViewport();
      window.location.href = isSupervisorOnMobile ? "/inicio" : "/ventas";
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f0ede6" }}>

      {/* Header rojo */}
      <div style={{
        background: "#CC2020", borderBottom: "4px solid #1A5FA8",
        padding: "24px", display: "flex", flexDirection: "column",
        alignItems: "center", gap: "4px",
      }}>
        <img
          src="/logo-super-juampy-header.png"
          alt="Super Juampy"
          style={{ height: "76px", width: "auto", objectFit: "contain" }}
        />
        <p style={{ color: "rgba(255,255,255,0.75)", fontSize: "12px", margin: "8px 0 0" }}>
          Sistema de gestion de caja
        </p>
      </div>

      {/* Card login */}
      <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 24px" }}>
        <div style={{
          background: "white", borderRadius: "16px", padding: "32px 28px",
          width: "100%", maxWidth: "380px",
          border: "1px solid #e0ddd5",
          boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
        }}>
          <h1 style={{ fontSize: "18px", fontWeight: "500", color: "#1a1a1a", margin: "0 0 6px" }}>
            Ingreso de caja
          </h1>
          <p style={{ fontSize: "13px", color: "#888", margin: "0 0 24px" }}>
            Ingresa tu codigo y PIN
          </p>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: "500", color: "#555" }}>Codigo de empleado</label>
              <input
                value={code}
                onChange={e => setCode(e.target.value)}
                autoFocus
                placeholder="Ej: 201"
                style={{
                  border: "1.5px solid #ddd", borderRadius: "8px",
                  padding: "11px 13px", fontSize: "16px", outline: "none",
                  width: "100%", boxSizing: "border-box",
                }}
                onFocus={e => (e.target.style.borderColor = "#1A5FA8")}
                onBlur={e => (e.target.style.borderColor = "#ddd")}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: "500", color: "#555" }}>PIN</label>
              <input
                value={pin}
                onChange={e => setPin(e.target.value)}
                type="password"
                inputMode="numeric"
                placeholder="••••"
                style={{
                  border: "1.5px solid #ddd", borderRadius: "8px",
                  padding: "11px 13px", fontSize: "20px", outline: "none",
                  width: "100%", boxSizing: "border-box", letterSpacing: "6px",
                }}
                onFocus={e => (e.target.style.borderColor = "#1A5FA8")}
                onBlur={e => (e.target.style.borderColor = "#ddd")}
              />
            </div>

            <button
              disabled={loading || !code || !pin}
              style={{
                background: loading || !code || !pin ? "#bbb" : "#CC2020",
                color: "white", border: "none", borderRadius: "8px",
                padding: "13px", fontSize: "15px", fontWeight: "500",
                cursor: loading || !code || !pin ? "not-allowed" : "pointer",
                marginTop: "4px", width: "100%",
              }}
            >
              {loading ? "Ingresando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
