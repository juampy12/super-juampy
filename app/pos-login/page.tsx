"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setPosEmployee } from "@/lib/posSession";
import toast from "react-hot-toast";

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
        toast.error(json?.error || "Codigo o PIN incorrecto");
        return;
      }
      setPosEmployee(json.employee);
      window.location.href = "/ventas";
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#f5f4f1",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>

      {/* Card */}
      <div style={{
        background: "white", borderRadius: "16px", padding: "40px 36px",
        width: "100%", maxWidth: "400px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        border: "1px solid #e8e5de",
      }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <img src="/logo-super-juampy.png" alt="Super Juampy"
            style={{ height: "90px", width: "auto", margin: "0 auto" }} />
        </div>

        {/* Titulo */}
        <div style={{ marginBottom: "24px", textAlign: "center" }}>
          <h1 style={{ fontSize: "20px", fontWeight: "500", color: "#1a1a1a", margin: 0 }}>Ingreso de caja</h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}>Ingresa tu codigo y PIN para continuar</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "13px", fontWeight: "500", color: "#444" }}>Codigo</label>
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              autoFocus
              placeholder="Ej: 201"
              style={{
                border: "1.5px solid #ddd", borderRadius: "8px",
                padding: "10px 12px", fontSize: "15px", outline: "none",
                transition: "border-color 0.15s",
              }}
              onFocus={e => (e.target.style.borderColor = "#1A5FA8")}
              onBlur={e => (e.target.style.borderColor = "#ddd")}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "13px", fontWeight: "500", color: "#444" }}>PIN</label>
            <input
              value={pin}
              onChange={e => setPin(e.target.value)}
              type="password"
              inputMode="numeric"
              placeholder="••••"
              style={{
                border: "1.5px solid #ddd", borderRadius: "8px",
                padding: "10px 12px", fontSize: "15px", outline: "none",
                transition: "border-color 0.15s", letterSpacing: "4px",
              }}
              onFocus={e => (e.target.style.borderColor = "#1A5FA8")}
              onBlur={e => (e.target.style.borderColor = "#ddd")}
            />
          </div>

          <button
            disabled={loading || !code || !pin}
            style={{
              background: loading || !code || !pin ? "#ccc" : "#CC2020",
              color: "white", border: "none", borderRadius: "8px",
              padding: "12px", fontSize: "15px", fontWeight: "500",
              cursor: loading || !code || !pin ? "not-allowed" : "pointer",
              marginTop: "4px", transition: "background 0.15s",
            }}
          >
            {loading ? "Ingresando..." : "Entrar"}
          </button>
        </form>

        {/* Footer */}
        <p style={{ textAlign: "center", fontSize: "12px", color: "#bbb", marginTop: "24px" }}>
          Super Juampy · Sistema de gestion
        </p>
      </div>
    </div>
  );
}
