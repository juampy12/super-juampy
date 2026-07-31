-- ================================================================
-- bulk_update_product_prices_v3 — agrega p_units_per_case (opcional)
--
-- Motivo: /importar-precios suma la opción "Precio por bulto — dividir
-- por unidades" (proveedores como Bimbo/Brusa, donde el precio de lista
-- viene por bulto/caja y la cantidad de unidades está en la descripción,
-- ej. "X 24U"). Cuando esa opción está activa y la fila tiene unidades
-- resueltas (detectadas o corregidas a mano en la vista previa), se
-- guarda esa cantidad en products.units_per_case como referencia —
-- mismo criterio NULL-safe por fila que ya usan cost_net/markup_rate/
-- vat_rate/name: NULL en esa fila = no tocar la columna.
--
-- Se DROPEA la firma anterior de 6 parámetros (con p_names, de
-- sql/bulk_update_product_prices_names.sql) antes de crear la de 7
-- para evitar overloads ambiguos en PostgREST (mismo patrón ya usado
-- en esa migración y en products_price_updated_at.sql).
--
-- Aditivo para los otros call-sites (bulk-update de /products,
-- bulk-create de reactivación): llaman con objeto nombrado y nunca
-- mandan p_units_per_case → Postgres usa el DEFAULT NULL, que se
-- normaliza a un array de NULLs del mismo largo que p_ids antes del
-- unnest (mismo truco que p_names) para no depender de cómo unnest()
-- resuelve un array-NULL "completo" mezclado con arrays reales.
--
-- Aplicar manualmente en el SQL editor de Supabase.
-- ================================================================

DROP FUNCTION IF EXISTS public.bulk_update_product_prices_v3(uuid[], numeric[], numeric[], numeric[], numeric[], text[]);

CREATE FUNCTION public.bulk_update_product_prices_v3(
  p_ids            uuid[],
  p_prices         numeric[],
  p_cost_nets      numeric[],
  p_markup_rates   numeric[],
  p_vat_rates      numeric[],
  p_names          text[] DEFAULT NULL,
  p_units_per_case integer[] DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE products p
    SET price          = u.price,
        cost_net       = COALESCE(u.cost_net, p.cost_net),
        markup_rate    = COALESCE(u.markup_rate, p.markup_rate),
        vat_rate       = COALESCE(u.vat_rate, p.vat_rate),
        name           = COALESCE(NULLIF(trim(u.name), ''), p.name),
        units_per_case = COALESCE(u.units_per_case, p.units_per_case),
        price_updated_at = CASE
          WHEN u.price IS DISTINCT FROM p.price THEN now()
          ELSE p.price_updated_at
        END
    FROM unnest(
      p_ids,
      p_prices,
      p_cost_nets,
      p_markup_rates,
      p_vat_rates,
      COALESCE(p_names, array_fill(NULL::text, ARRAY[COALESCE(array_length(p_ids, 1), 0)])),
      COALESCE(p_units_per_case, array_fill(NULL::integer, ARRAY[COALESCE(array_length(p_ids, 1), 0)]))
    ) AS u(id, price, cost_net, markup_rate, vat_rate, name, units_per_case)
    WHERE p.id = u.id
    RETURNING p.id
  )
  SELECT count(*)::integer FROM updated;
$$;

REVOKE ALL     ON FUNCTION public.bulk_update_product_prices_v3(uuid[], numeric[], numeric[], numeric[], numeric[], text[], integer[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bulk_update_product_prices_v3(uuid[], numeric[], numeric[], numeric[], numeric[], text[], integer[]) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.bulk_update_product_prices_v3(uuid[], numeric[], numeric[], numeric[], numeric[], text[], integer[]) TO service_role;
