-- ================================================================
-- bulk_update_product_prices_v2
-- Igual que bulk_update_product_prices pero además puede actualizar
-- cost_net en el mismo UPDATE en lote. Si p_cost_nets[i] es NULL,
-- ese producto conserva su cost_net actual (no se pisa).
--
-- Aplicado en Supabase el 2026-06-21. Usado por
-- /api/products/bulk-price-import cuando el checkbox "Guardar
-- también como precio de costo" está activo en /importar-precios.
-- ================================================================

CREATE OR REPLACE FUNCTION public.bulk_update_product_prices_v2(
  p_ids       uuid[],
  p_prices    numeric[],
  p_cost_nets numeric[]
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE products p
    SET price    = u.price,
        cost_net = COALESCE(u.cost_net, p.cost_net)
    FROM unnest(p_ids, p_prices, p_cost_nets) AS u(id, price, cost_net)
    WHERE p.id = u.id
    RETURNING p.id
  )
  SELECT count(*)::integer FROM updated;
$$;

REVOKE ALL     ON FUNCTION public.bulk_update_product_prices_v2(uuid[], numeric[], numeric[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bulk_update_product_prices_v2(uuid[], numeric[], numeric[]) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.bulk_update_product_prices_v2(uuid[], numeric[], numeric[]) TO service_role;
