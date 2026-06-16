-- ================================================================
-- FIX: aplicar precios masivos se tildaba con 2197+ productos
--
-- CAUSA: /api/products/bulk-price-import hacía un UPDATE por producto
-- en un loop secuencial (2197 round-trips a la DB en un solo request),
-- excediendo el timeout de la función serverless de Vercel.
--
-- FIX: una sola sentencia UPDATE...FROM unnest() actualiza todos los
-- precios del chunk en un solo round-trip a la DB.
--
-- Ejecutar en: Supabase → SQL Editor → Run all
-- ================================================================

CREATE OR REPLACE FUNCTION public.bulk_update_product_prices(
  p_ids    uuid[],
  p_prices numeric[]
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE products p
    SET price = u.price
    FROM unnest(p_ids, p_prices) AS u(id, price)
    WHERE p.id = u.id
    RETURNING p.id
  )
  SELECT count(*)::integer FROM updated;
$$;

REVOKE ALL     ON FUNCTION public.bulk_update_product_prices(uuid[], numeric[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bulk_update_product_prices(uuid[], numeric[]) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.bulk_update_product_prices(uuid[], numeric[]) TO service_role;
