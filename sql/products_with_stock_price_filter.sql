-- ================================================================
-- products_with_stock — agrega p_price_filter
--
-- Bug: en /products, los filtros de estado (Sin costo, Sin margen,
-- Bajo costo, Manuales) filtraban client-side solo sobre la página
-- ya cargada (rows en memoria), mientras que las tarjetas contadoras
-- de arriba muestran los totales GLOBALES via products_price_stats().
-- Resultado: el supervisor clickeaba "Sin costo: 221" y veía ~30.
--
-- Fix: products_with_stock ahora acepta p_price_filter opcional. Si
-- viene seteado, filtra en el WHERE (server-side, con paginación via
-- el modo "all" que ya usa /api/products/search) usando EXACTAMENTE
-- las mismas condiciones que products_price_stats (sql/products_price_stats.sql)
-- y priceFlags() en app/products/page.tsx:
--   no_cost    = cost_net <= 0
--   no_margin  = markup_rate <= 0
--   below_cost = cost_net > 0 y price > 0 y price < cost_net
--   manual     = price difiere en más de 1 centavo del sugerido
--   review     = no_cost OR no_margin OR below_cost
-- y, al igual que products_price_stats, exige active = true.
--
-- Parámetro nuevo con DEFAULT NULL: no rompe otros llamadores
-- existentes (ventas/page.tsx, warmCache) que no lo pasan.
--
-- Aplicar manualmente en el SQL editor de Supabase.
-- ================================================================

DROP FUNCTION IF EXISTS public.products_with_stock(uuid, text, integer);

CREATE FUNCTION public.products_with_stock(
  p_store uuid,
  p_query text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_price_filter text DEFAULT NULL::text
)
 RETURNS TABLE(id uuid, sku text, name text, price numeric, effective_price numeric, has_offer boolean, offer_type text, offer_value numeric, qty_buy integer, qty_pay integer, cost_net numeric, vat_rate numeric, markup_rate numeric, units_per_case integer, stock numeric, is_weighted boolean, active boolean)
 LANGUAGE sql
AS $function$
  SELECT
    p.id,
    p.sku,
    p.name,
    p.price,

    -- precio efectivo si hay oferta vigente (nxm/second_unit_pct caen
    -- en el ELSE: el precio por unidad "de lista" no cambia, el
    -- descuento por cantidad se calcula en confirm_sale_with_stock)
    CASE
      WHEN o.id IS NULL THEN p.price
      WHEN o.type = 'fixed_price' THEN o.value
      WHEN o.type = 'percent' THEN ROUND(p.price * (1 - (o.value / 100.0)), 2)
      ELSE p.price
    END AS effective_price,

    (o.id IS NOT NULL) AS has_offer,
    o.type::text       AS offer_type,
    o.value::numeric   AS offer_value,
    o.qty_buy          AS qty_buy,
    o.qty_pay          AS qty_pay,

    p.cost_net,
    p.vat_rate,
    p.markup_rate,
    p.units_per_case,

    -- STOCK REAL: product_stocks (NO suma movimientos)
    COALESCE(ps.stock, 0)::numeric AS stock,

    p.is_weighted,
    p.active

  FROM products p

  LEFT JOIN public.product_stocks ps
    ON ps.store_id = p_store
   AND ps.product_id = p.id

  -- oferta vigente (prioriza sucursal sobre global)
  LEFT JOIN LATERAL (
    SELECT po.id, po.type, po.value, po.qty_buy, po.qty_pay
    FROM public.product_offers po
    WHERE po.product_id = p.id
      AND po.is_active = true
      AND po.starts_at <= now()
      AND po.ends_at >= now()
      AND (po.store_id = p_store OR po.store_id IS NULL)
    ORDER BY (po.store_id = p_store) DESC, po.created_at DESC
    LIMIT 1
  ) o ON true

  WHERE
    (
      p_query IS NULL
      OR p.name ILIKE '%' || p_query || '%'
      OR p.sku  ILIKE '%' || p_query || '%'
    )
    AND (
      p_price_filter IS NULL
      OR (
        p.active = true
        AND (
          (p_price_filter = 'no_cost'
            AND COALESCE(p.cost_net, 0) <= 0)
          OR (p_price_filter = 'no_margin'
            AND COALESCE(p.markup_rate, 0) <= 0)
          OR (p_price_filter = 'below_cost'
            AND COALESCE(p.cost_net, 0) > 0
            AND COALESCE(p.price, 0) > 0
            AND COALESCE(p.price, 0) < COALESCE(p.cost_net, 0))
          OR (p_price_filter = 'manual'
            AND abs(
              COALESCE(p.price, 0) - round(
                COALESCE(p.cost_net, 0)
                  * (1 + COALESCE(p.vat_rate, 21) / 100.0)
                  * (1 + COALESCE(p.markup_rate, 0) / 100.0),
                2
              )
            ) > 0.009)
          OR (p_price_filter = 'review'
            AND (
              COALESCE(p.cost_net, 0) <= 0
              OR COALESCE(p.markup_rate, 0) <= 0
              OR (
                COALESCE(p.cost_net, 0) > 0
                AND COALESCE(p.price, 0) > 0
                AND COALESCE(p.price, 0) < COALESCE(p.cost_net, 0)
              )
            ))
        )
      )
    )
  ORDER BY p.name
  LIMIT p_limit;
$function$;

REVOKE ALL     ON FUNCTION public.products_with_stock FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.products_with_stock FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.products_with_stock TO service_role;
