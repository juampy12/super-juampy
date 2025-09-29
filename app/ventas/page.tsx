"use client";

export type HeldCart = {
  items: Array<{ id: string; name: string; price: number; qty: number }>;
  note?: string;
  savedAt: string; // ISO
};

const KEY = "superjuampy.pos.heldCart";

export function saveHeldCart(cart: HeldCart) {
  try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch {}
}

export function getHeldCart(): HeldCart | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HeldCart;
  } catch { return null; }
}

export function clearHeldCart() {
  try { localStorage.removeItem(KEY); } catch {}
}

