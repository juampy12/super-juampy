"use client";
import { useEffect } from "react";

type Props = {
  onOpenPayment?: () => void;
  onClosePayment?: () => void;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onFocusSearch?: () => void;
};

export default function PosShortcuts(p: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); p.onFocusSearch?.(); }
      if (e.key === "F4") { e.preventDefault(); p.onOpenPayment?.(); }
      if (e.key === "Escape") { p.onClosePayment?.(); }
      if (e.key === "+") { p.onIncrement?.(); }
      if (e.key === "-") { p.onDecrement?.(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p]);
  return null;
}
