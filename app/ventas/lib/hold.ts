export const HOLD_KEY = "pos_current_cart_v1";
export function saveHold(payload: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(HOLD_KEY, JSON.stringify(payload));
}
export function loadHold<T = any>(): T | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(HOLD_KEY) ?? "null"); }
  catch { return null; }
}
export function clearHold(){ if (typeof window !== "undefined") localStorage.removeItem(HOLD_KEY); }
