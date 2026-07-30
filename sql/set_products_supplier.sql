-- ================================================================
-- Módulo de proveedores — Etapa 2: set_products_supplier.
--
-- Asigna supplier_id en lote. A propósito NO se integra a
-- bulk_update_product_prices_v3 (esa función no se toca): así
-- asignar proveedor y actualizar precio son operaciones compatibles
-- pero independientes — se puede asignar proveedor sin tocar
-- price/cost_net/markup_rate/vat_rate, y viceversa.
--
-- Usada por POST /api/products/assign-supplier.
--
-- Ya aplicado en Supabase (2026-07-30). Este archivo es solo
-- documentación — el repo no despliega SQL automáticamente.
-- ================================================================

CREATE OR REPLACE FUNCTION public.set_products_supplier(
  p_ids          uuid[],
  p_supplier_id  uuid
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE products
    SET supplier_id = p_supplier_id
    WHERE id = ANY(p_ids)
    RETURNING 1
  )
  SELECT count(*)::integer FROM updated;
$$;

REVOKE ALL     ON FUNCTION public.set_products_supplier(uuid[], uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_products_supplier(uuid[], uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.set_products_supplier(uuid[], uuid) TO service_role;
