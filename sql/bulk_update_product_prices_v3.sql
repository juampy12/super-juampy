-- ================================================================
-- bulk_update_product_prices_v3
-- Extiende v2: además de price y cost_net, actualiza markup_rate y
-- vat_rate en el mismo UPDATE en lote. NULL en cualquier array
-- significa "no tocar ese campo para esa fila" (igual que cost_net
-- en v2).
--
-- Aplicado en Supabase el 2026-06-21. Usado por
-- /api/products/bulk-price-import: cuando el checkbox "Guardar
-- también como precio de costo" está activo en /importar-precios,
-- además de cost_net se guarda markup_rate (el margen aplicado) y
-- vat_rate=0 — el precio del importador es costo × (1 + margen%)
-- sin IVA aplicado por separado, así que vat_rate=0 mantiene el
-- "precio sugerido" de /products consistente con el price real
-- guardado.
-- ================================================================

CREATE OR REPLACE FUNCTION public.bulk_update_product_prices_v3(
  p_ids          uuid[],
  p_prices       numeric[],
  p_cost_nets    numeric[],
  p_markup_rates numeric[],
  p_vat_rates    numeric[]
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE products p
    SET price       = u.price,
        cost_net    = COALESCE(u.cost_net, p.cost_net),
        markup_rate = COALESCE(u.markup_rate, p.markup_rate),
        vat_rate    = COALESCE(u.vat_rate, p.vat_rate)
    FROM unnest(p_ids, p_prices, p_cost_nets, p_markup_rates, p_vat_rates)
      AS u(id, price, cost_net, markup_rate, vat_rate)
    WHERE p.id = u.id
    RETURNING p.id
  )
  SELECT count(*)::integer FROM updated;
$$;

REVOKE ALL     ON FUNCTION public.bulk_update_product_prices_v3(uuid[], numeric[], numeric[], numeric[], numeric[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bulk_update_product_prices_v3(uuid[], numeric[], numeric[], numeric[], numeric[]) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.bulk_update_product_prices_v3(uuid[], numeric[], numeric[], numeric[], numeric[]) TO service_role;
