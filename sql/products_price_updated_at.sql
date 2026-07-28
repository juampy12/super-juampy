-- ================================================================
-- products_price_updated_at
-- Agrega tracking de "cuándo cambió el precio" para poder imprimir
-- en /etiquetas SOLO lo que cambió recientemente, sin reimprimir
-- todo el catálogo cada vez.
--
-- Aplicar manualmente en el SQL editor de Supabase, en orden (de
-- arriba hacia abajo, es un solo script). No requiere downtime.
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 1) Columna nueva en products: cuándo cambió price por última vez.
--    DEFAULT now() → los productos existentes arrancan con "ahora"
--    (no hay forma de recuperar la fecha real pasada); los nuevos la
--    traen gratis al insertar.
-- ────────────────────────────────────────────────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_updated_at timestamptz NOT NULL DEFAULT now();


-- ────────────────────────────────────────────────────────────────
-- 2) bulk_update_product_prices_v3: setea price_updated_at = now()
--    SOLO cuando el precio realmente cambia (IS DISTINCT FROM), para
--    no ensuciar la fecha en guardados que no tocan price. Es el
--    único RPC que escribe price en lote — usado por bulk-update
--    (/products), bulk-price-import (/importar-precios) y
--    bulk-create (reactivación). Cambio ADITIVO: misma firma, mismo
--    RETURNING/count, mismo comportamiento de cost_net/vat_rate/
--    markup_rate (COALESCE sin tocar) — no afecta imports ni
--    guardados en curso, solo agrega el sello de fecha.
-- ────────────────────────────────────────────────────────────────

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
        vat_rate    = COALESCE(u.vat_rate, p.vat_rate),
        price_updated_at = CASE
          WHEN u.price IS DISTINCT FROM p.price THEN now()
          ELSE p.price_updated_at
        END
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


-- ────────────────────────────────────────────────────────────────
-- 3) products_with_stock: agrega p_recent_hours opcional (numeric,
--    admite fracciones — así /etiquetas puede pedir "últimas 24
--    horas" o "últimos 3 días" = 72 horas con el mismo parámetro).
--    Reusa la MISMA función que ya usan /etiquetas, /ventas y
--    /products (con p_price_filter agregado en
--    sql/products_with_stock_price_filter.sql) — así el PDF de
--    etiquetas sigue trayendo effective_price/has_offer/is_weighted
--    sin duplicar lógica en una función nueva.
--    DEFAULT NULL: no rompe a los llamadores que no lo pasan.
--
--    Se dropean AMBAS firmas anteriores posibles (la original de 3
--    parámetros y la de 4 con p_price_filter) para que este script
--    sea idempotente sin importar si ya se aplicó
--    products_with_stock_price_filter.sql — dejar dos overloads con
--    parámetros opcionales solapados hace que Postgres/PostgREST
--    tire "function is not unique" en llamadas ambiguas.
-- ────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.products_with_stock(uuid, text, integer);
DROP FUNCTION IF EXISTS public.products_with_stock(uuid, text, integer, text);

CREATE FUNCTION public.products_with_stock(
  p_store uuid,
  p_query text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_price_filter text DEFAULT NULL::text,
  p_recent_hours numeric DEFAULT NULL::numeric
)
 RETURNS TABLE(id uuid, sku text, name text, price numeric, effective_price numeric, has_offer boolean, offer_type text, offer_value numeric, qty_buy integer, qty_pay integer, cost_net numeric, vat_rate numeric, markup_rate numeric, units_per_case integer, stock numeric, is_weighted boolean, active boolean)
 LANGUAGE sql
AS $function$
  SELECT
    p.id,
    p.sku,
    p.name,
    p.price,

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

    COALESCE(ps.stock, 0)::numeric AS stock,

    p.is_weighted,
    p.active

  FROM products p

  LEFT JOIN public.product_stocks ps
    ON ps.store_id = p_store
   AND ps.product_id = p.id

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
    AND (
      p_recent_hours IS NULL
      OR p.price_updated_at >= now() - (p_recent_hours::double precision * interval '1 hour')
    )
  ORDER BY
    CASE WHEN p_recent_hours IS NOT NULL THEN p.price_updated_at END DESC NULLS LAST,
    p.name
  LIMIT p_limit;
$function$;

REVOKE ALL     ON FUNCTION public.products_with_stock FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.products_with_stock FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.products_with_stock TO service_role;
