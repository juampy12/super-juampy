"use client";
import { useEffect } from "react";

/** Fuerza tema claro en la app completa */
export default function ForceLight() {
  useEffect(() => {
    try {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("theme"); // por si algún toggle lo guardó
      // Asegura esquema de color claro para inputs nativos
      document.documentElement.style.colorScheme = "light";
    } catch {
  /* TODO: implementar o eliminar si no se usa */
}
  }, []);
  return null;
}
