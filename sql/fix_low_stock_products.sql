-- ============================================================
-- FIX: Recrear v_products_stock_low + low_stock_products
--
-- CAUSA RAÍZ CONFIRMADA (diagnóstico 2026-06-14):
--   La vista/función usa products.stock (columna global/legacy,
--   valor = 0 para la mayoría de los productos) en vez de
--   product_stocks.stock (tabla por sucursal, con datos reales).
--
--   Evidencia:
--     A.M.VILLA DEL SUR .6 L
--       products.stock       = 0     ← columna global, incorrecta
--       product_stocks.stock = 76    ← Alberdi, CORRECTA
--       product_min_stock    = 80    ← Alberdi
--     → 76 < 80 → debería aparecer; la función retorna []
--
-- SOLUCIÓN: reescribir vista y función usando product_stocks.
-- Ejecutar en Supabase → SQL Editor (requiere permisos de superusuario).
-- ============================================================

-- ── 1. Recrear vista ───────────────────────────────────────────────────────
--    LEFT JOIN en product_stocks para que productos sin fila en esa tabla
--    aparezcan con stock = 0 (no quedan excluidos del resultado).
CREATE OR REPLACE VIEW public.v_products_stock_low AS
SELECT
  p.id,
  p.name,
  p.sku,
  p.price,
  COALESCE(ps.stock, 0)                               AS stock,
  pms.min_stock,
  GREATEST(pms.min_stock - COALESCE(ps.stock, 0), 0) AS missing,
  pms.store_id,
  s.name                                              AS store_name
FROM  public.products          p
JOIN  public.product_min_stock pms ON pms.product_id = p.id
LEFT JOIN public.product_stocks ps
       ON ps.product_id = p.id
      AND ps.store_id   = pms.store_id
JOIN  public.stores            s   ON s.id = pms.store_id
WHERE p.active = true;

-- ── 2. Recrear función ─────────────────────────────────────────────────────
--    Mismos parámetros que antes: p_store, p_query, p_limit
--    Retorna todos los productos con mínimo configurado para esa sucursal
--    (el cliente filtra missing > 0 para mostrar solo los faltantes).
CREATE OR REPLACE FUNCTION public.low_stock_products(
  p_store  uuid,
  p_query  text    DEFAULT NULL,
  p_limit  integer DEFAULT 400
)
RETURNS TABLE (
  id        uuid,
  sku       text,
  name      text,
  price     numeric,
  stock     numeric,
  min_stock numeric,
  missing   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    v.id,
    v.sku,
    v.name,
    v.price,
    v.stock,
    v.min_stock,
    v.missing
  FROM public.v_products_stock_low v
  WHERE v.store_id = p_store
    AND (
      p_query IS NULL
      OR v.name ILIKE '%' || p_query || '%'
      OR v.sku  ILIKE '%' || p_query || '%'
    )
  ORDER BY v.missing DESC, v.name ASC
  LIMIT p_limit;
$$;

-- ── 3. Ajustar permisos ─────────────────────────────────────────────────────
--    Solo service_role (server-side) puede llamar la función.
--    Consistent con el REVOKE general que ya generamos.
REVOKE EXECUTE ON FUNCTION public.low_stock_products(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.low_stock_products(uuid, text, integer)
  TO service_role;

-- ── 4. Verificación inmediata ───────────────────────────────────────────────
--    Después de ejecutar el bloque de arriba, este SELECT debe mostrar:
--    - total_con_minimo > 0  (todos los productos con mínimo configurado)
--    - bajo_minimo > 0       (al menos Villa del Sur: stock=76 < min=80)
SELECT
  'RESULTADO' AS check_,
  COUNT(*)                                    AS total_con_minimo,
  COUNT(*) FILTER (WHERE missing > 0)         AS bajo_minimo,
  COUNT(*) FILTER (WHERE store_id = '914dee4d-a78c-4f3f-8998-402c56fc88e9') AS alberdi_total
FROM public.v_products_stock_low;

-- Verificar Villa del Sur específicamente:
SELECT id, name, stock, min_stock, missing, store_id
FROM public.v_products_stock_low
WHERE name ILIKE '%villa del sur%';
