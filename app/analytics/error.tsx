"use client";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Analítica /analytics error ⛑️", error);
  }, [error]);

  return (
    <div style={{ padding: "2rem", maxWidth: 900 }}>
      <h2 style={{ marginBottom: 8 }}>😵‍💫 Falló el panel de analítica</h2>
      <p style={{ marginBottom: 12 }}>{error.message}</p>
      <button onClick={() => reset()} style={{ padding: "8px 12px", marginTop: 8 }}>
        Reintentar
      </button>
    </div>
  );
}
