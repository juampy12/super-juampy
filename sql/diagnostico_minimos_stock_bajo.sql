-- ============================================================
-- DIAGNÓSTICO: set_min_stock + low_stock_products
-- Ejecutar en Supabase → SQL Editor
-- Reemplazar 'TU-STORE-UUID' con el UUID real de la sucursal
-- ============================================================

-- ── 1. ¿Qué guarda set_min_stock? ──────────────────────────────────────────
-- Debe haber al menos una fila si guardaste el mínimo correctamente.
SELECT
  pms.store_id,
  pms.product_id,
  pms.min_stock,
  p.name           AS product_name,
  ps.stock         AS current_stock
FROM product_min_stock pms
LEFT JOIN products p  ON p.id = pms.product_id
LEFT JOIN product_stocks ps
       ON ps.product_id = pms.product_id
      AND ps.store_id = pms.store_id
ORDER BY pms.store_id, p.name
LIMIT 20;

-- ── 2. ¿Qué columnas retorna low_stock_products? ───────────────────────────
-- Reemplazá 'TU-STORE-UUID' con el ID real de la sucursal.
-- CLAVE: ¿la función retorna "id" o "product_id"?
-- Si retorna "product_id", el código de stock-bajo usa r.id (undefined)
-- y descarta todas las filas.
SELECT *
FROM low_stock_products(
  p_store => 'TU-STORE-UUID',
  p_query => null,
  p_limit => 50
);

-- ── 3. Definición de la función ────────────────────────────────────────────
-- Revela el umbral exacto: ¿stock < min_stock? ¿stock <= min_stock * 1.1?
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'low_stock_products'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- ── 4. Definición de set_min_stock ─────────────────────────────────────────
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'set_min_stock'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- ── 5. ¿El producto específico tiene fila? ─────────────────────────────────
-- Buscar "VILLA DEL SUR" en product_min_stock
SELECT
  pms.*,
  p.name,
  ps.stock
FROM product_min_stock pms
JOIN products p ON p.id = pms.product_id
LEFT JOIN product_stocks ps
       ON ps.product_id = pms.product_id
      AND ps.store_id = pms.store_id
WHERE p.name ILIKE '%villa del sur%';
