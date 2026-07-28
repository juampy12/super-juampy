-- ================================================================
-- products_price_stats
-- Conteos GLOBALES del catálogo activo, calculados en el servidor
-- con un solo SELECT ... FILTER, en vez de reducirse sobre la lista
-- ya paginada en /products (bug: las tarjetas de arriba cambiaban
-- según cuántas páginas se habían cargado, en vez de reflejar el
-- catálogo completo).
--
-- Replica exactamente las mismas condiciones que priceFlags() en
-- app/products/page.tsx:
--   no_cost    = cost_net IS NULL o <= 0
--   no_margin  = markup_rate IS NULL o <= 0
--   below_cost = cost_net > 0 y price > 0 y price < cost_net
--   manual     = price difiere en más de 1 centavo del sugerido
--                (cost_net * (1+iva%) * (1+margen%), redondeado)
--
-- Se usa desde /api/products/stats, llamado por /products al cargar
-- y después de "Guardar cambios" — no depende de sucursal ni de
-- paginación/búsqueda.
--
-- Aplicar manualmente en el SQL editor de Supabase (no hay migration
-- runner en este repo, ver el resto de sql/*.sql).
-- ================================================================

CREATE OR REPLACE FUNCTION public.products_price_stats()
RETURNS TABLE (
  total      bigint,
  manual     bigint,
  no_cost    bigint,
  no_margin  bigint,
  below_cost bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*) AS total,
    count(*) FILTER (
      WHERE abs(
        COALESCE(price, 0) - round(
          COALESCE(cost_net, 0)
            * (1 + COALESCE(vat_rate, 21) / 100.0)
            * (1 + COALESCE(markup_rate, 0) / 100.0),
          2
        )
      ) > 0.009
    ) AS manual,
    count(*) FILTER (WHERE COALESCE(cost_net, 0) <= 0) AS no_cost,
    count(*) FILTER (WHERE COALESCE(markup_rate, 0) <= 0) AS no_margin,
    count(*) FILTER (
      WHERE COALESCE(cost_net, 0) > 0
        AND COALESCE(price, 0) > 0
        AND COALESCE(price, 0) < COALESCE(cost_net, 0)
    ) AS below_cost
  FROM products
  WHERE active = true;
$$;

REVOKE ALL ON FUNCTION public.products_price_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.products_price_stats() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.products_price_stats() TO service_role;
