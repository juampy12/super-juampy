import type { SupabaseClient } from "@supabase/supabase-js";

const DB_NAME = "pos_idb_v1";
const DB_STORE = "product_cache";
const CACHE_LIMIT = 3000;

export type CachedProduct = {
  id: string;
  sku: string | null;
  name: string;
  price: number;
  stock: number;
  is_weighted: boolean;
  active: boolean;
  effective_price?: number | null;
  has_offer?: boolean | null;
  offer_type?: string | null;
  offer_value?: number | null;
};

type CacheRecord = {
  storeId: string;
  savedAt: number;
  products: CachedProduct[];
};

// In-memory layer — populated from IndexedDB on init, stays warm for the session
const mem = new Map<string, CacheRecord>();

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE))
        req.result.createObjectStore(DB_STORE, { keyPath: "storeId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(storeId: string): Promise<CacheRecord | null> {
  try {
    const db = await idbOpen();
    return new Promise((resolve) => {
      const req = db.transaction(DB_STORE).objectStore(DB_STORE).get(storeId);
      req.onsuccess = () => resolve((req.result as CacheRecord) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function idbPut(rec: CacheRecord): Promise<void> {
  try {
    const db = await idbOpen();
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put(rec);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch { }
}

function persist(storeId: string, products: CachedProduct[]) {
  if (typeof window === "undefined") return;
  const rec: CacheRecord = { storeId, products, savedAt: Date.now() };
  mem.set(storeId, rec);
  void idbPut(rec);
}

// Load IndexedDB into memory. Call when storeId is known (works offline too).
export async function initProductCache(storeId: string): Promise<void> {
  if (typeof window === "undefined" || mem.has(storeId)) return;
  const rec = await idbGet(storeId);
  if (rec) mem.set(storeId, rec);
}

export function getCachedProducts(storeId: string): CachedProduct[] | null {
  return mem.get(storeId)?.products ?? null;
}

export function getCacheSavedAt(storeId: string): number | null {
  return mem.get(storeId)?.savedAt ?? null;
}

export function setCachedProducts(storeId: string, products: CachedProduct[]) {
  persist(storeId, products);
}

export function searchCachedProducts(storeId: string, term: string): CachedProduct[] {
  const products = getCachedProducts(storeId);
  if (!products) return [];
  const t = term.toLowerCase().trim();
  return products
    .filter(p => p.active !== false && (
      p.name.toLowerCase().includes(t) ||
      (p.sku ?? "").toLowerCase().includes(t)
    ))
    .slice(0, 20);
}

export async function warmCache(supabase: SupabaseClient, storeId: string): Promise<void> {
  try {
    const { data, error } = await supabase.rpc("products_with_stock", {
      p_store: storeId,
      p_query: null,
      p_limit: CACHE_LIMIT,
    });
    if (error || !data) return;
    persist(storeId, data);
  } catch { }
}

export function mergeIntoCachedProducts(storeId: string, newProducts: CachedProduct[]) {
  if (typeof window === "undefined" || !newProducts.length) return;
  try {
    const existing = getCachedProducts(storeId) ?? [];
    const map = new Map(existing.map(p => [p.id, p]));
    for (const p of newProducts) map.set(p.id, p);
    persist(storeId, Array.from(map.values()));
  } catch { }
}
