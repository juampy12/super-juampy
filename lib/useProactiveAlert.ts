"use client";
import { useState, useEffect, useRef } from "react";
import { getPosEmployee } from "@/lib/posSession";

const STORAGE_KEY = "ai_proactive_date";

function todayAR() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" }).format(new Date());
}

export function useProactiveAlert() {
  const [message, setMessage] = useState<string | null>(null);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    const employee = getPosEmployee();
    if (employee?.role !== "supervisor") return;

    const today = todayAR();
    if (localStorage.getItem(STORAGE_KEY) === today) return;

    fetched.current = true;
    fetch("/api/ai/alerts")
      .then((r) => r.json())
      .then((data) => {
        if (data.message) {
          setMessage(data.message);
          localStorage.setItem(STORAGE_KEY, today);
        }
      })
      .catch(() => {});
  }, []);

  function clear() {
    setMessage(null);
  }

  return { message, clear };
}
