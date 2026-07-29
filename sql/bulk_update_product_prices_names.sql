-- ================================================================
-- bulk_update_product_prices_v3 — agrega p_names (opcional)
--
-- Motivo: /importar-precios ya conoce el "Detalle" (nombre real del
-- proveedor, ej. Haldemann) para cada producto matcheado por código
-- de barras, pero nunca lo aplicaba — solo tocaba price/cost_net/
-- markup_rate/vat_rate. Esto agrega la posibilidad de pisar el
-- nombre, NULL-safe por fila (mismo criterio que ya usa cost_net):
-- NULL o vacío en la fila = no tocar el nombre de ese producto.
--
-- Se DROPEA la firma anterior de 5 parámetros antes de crear la de
-- 6 para evitar overloads ambiguos en PostgREST (mismo patrón que
-- sql/products_price_updated_at.sql usó para products_with_stock:
-- dejar dos firmas con parámetros opcionales solapados tira
-- "function is not unique" en llamadas ambiguas).
--
-- Aditivo para los otros call-sites (bulk-update de /products,
-- bulk-create de reactivación): llaman con objeto nombrado y nunca
-- mandan p_names → Postgres usa el DEFAULT NULL. Para no depender
-- de cómo unnest() resuelve un array-NULL "completo" mezclado con
-- arrays reales, p_names se normaliza ANTES del unnest a un array
-- del mismo largo que p_ids relleno de NULL (vía COALESCE +
-- array_fill) — así el único camino que se ejecuta de verdad es el
-- ya probado en producción: arrays del mismo largo con NULL por
-- fila, igual que cost_net/markup_rate/vat_rate hoy.
--
-- Aplicar manualmente en el SQL editor de Supabase.
-- ================================================================

DROP FUNCTION IF EXISTS public.bulk_update_product_prices_v3(uuid[], numeric[], numeric[], numeric[], numeric[]);

CREATE FUNCTION public.bulk_update_product_prices_v3(
  p_ids          uuid[],
  p_prices       numeric[],
  p_cost_nets    numeric[],
  p_markup_rates numeric[],
  p_vat_rates    numeric[],
  p_names        text[] DEFAULT NULL
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
        vat_rate    = COALESCE(u.vat_rate, p.vat_rate),
        name        = COALESCE(NULLIF(trim(u.name), ''), p.name),
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
      COALESCE(p_names, array_fill(NULL::text, ARRAY[COALESCE(array_length(p_ids, 1), 0)]))
    ) AS u(id, price, cost_net, markup_rate, vat_rate, name)
    WHERE p.id = u.id
    RETURNING p.id
  )
  SELECT count(*)::integer FROM updated;
$$;

REVOKE ALL     ON FUNCTION public.bulk_update_product_prices_v3(uuid[], numeric[], numeric[], numeric[], numeric[], text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bulk_update_product_prices_v3(uuid[], numeric[], numeric[], numeric[], numeric[], text[]) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.bulk_update_product_prices_v3(uuid[], numeric[], numeric[], numeric[], numeric[], text[]) TO service_role;
