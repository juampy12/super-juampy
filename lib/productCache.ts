import type { SupabaseClient } from "@supabase/supabase-js";

const CACHE_KEY = "pos_product_cache_v1";
const CACHE_TTL = 1000 * 60 * 30; // 30 minutos

type CachedProduct = {
  id: string;
  sku: string | null;
  name: string;
  price: number;
  stock: number;
  is_weighted: boolean;
  active: boolean;
};

type Cache = {
  products: CachedProduct[];
  storeId: string;
  savedAt: number;
};

export function getCachedProducts(storeId: string): CachedProduct[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache: Cache = JSON.parse(raw);
    if (cache.storeId !== storeId) return null;
    if (Date.now() - cache.savedAt > CACHE_TTL) return null;
    return cache.products;
  } catch { return null; }
}

export function setCachedProducts(storeId: string, products: CachedProduct[]) {
  if (typeof window === "undefined") return;
  const cache: Cache = { products, storeId, savedAt: Date.now() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export function searchCachedProducts(storeId: string, term: string): CachedProduct[] {
  const products = getCachedProducts(storeId);
  if (!products) return [];
  const t = term.toLowerCase().trim();
  return products
    .filter(p => p.active && (
      p.name.toLowerCase().includes(t) ||
      (p.sku ?? "").toLowerCase().includes(t)
    ))
    .slice(0, 20);
}

export async function warmCache(supabase: SupabaseClient, storeId: string) {
  try {
    const { data, error } = await supabase.rpc("products_with_stock", {
      p_store: storeId,
      p_query: null,
      p_limit: 500,
    });
    if (error || !data) return;
    setCachedProducts(storeId, data);
  } catch { }
}
