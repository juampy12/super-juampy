-- ================================================================
-- BORRADOR — NO APLICADO. Pausado a pedido del usuario a un día del
-- lanzamiento del piloto (2026-07-28): agregar la columna ahora haría
-- que TODO el catálogo aparezca como "recién actualizado" (todos con
-- price_updated_at = hoy, por los precios que se están cargando en
-- caliente), y no se quiere tocar bulk_update_product_prices_v3
-- (el RPC que escribe price en lote) en pleno período de carga.
--
-- Retomar DESPUÉS del piloto, cuando los cambios de precio empiecen a
-- ser esporádicos y la columna sí discrimine algo útil.
--
-- Contexto / requerimiento original: /etiquetas necesita un botón
-- "Precios actualizados recientemente" (últimos X días) para no
-- reimprimir todo el catálogo cada vez que cambian precios.
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 1) Columna nueva en products: cuándo cambió price por última vez.
--    DEFAULT now() → los productos existentes arrancan con "hoy" (no
--    hay forma de recuperar la fecha real pasada); los nuevos la
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
--    bulk-create (reactivación).
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
-- 3) products_with_stock: agrega p_recent_days opcional. Reusa la
--    MISMA función que ya usan /etiquetas, /ventas y /products (con
--    p_price_filter agregado en sql/products_with_stock_price_filter.sql)
--    — así el PDF de etiquetas sigue trayendo effective_price/
--    has_offer/is_weighted sin duplicar lógica en una función nueva.
--    DEFAULT NULL: no rompe a los llamadores que no lo pasan.
--
--    OJO: este DROP/CREATE tiene que aplicarse DESPUÉS de
--    products_with_stock_price_filter.sql (que ya agregó
--    p_price_filter) — el DROP de acá asume esa firma de 4 parámetros.
-- ────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.products_with_stock(uuid, text, integer, text);

CREATE FUNCTION public.products_with_stock(
  p_store uuid,
  p_query text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_price_filter text DEFAULT NULL::text,
  p_recent_days integer DEFAULT NULL::integer
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
      p_recent_days IS NULL
      OR p.price_updated_at >= now() - make_interval(days => p_recent_days)
    )
  ORDER BY
    CASE WHEN p_recent_days IS NOT NULL THEN p.price_updated_at END DESC NULLS LAST,
    p.name
  LIMIT p_limit;
$function$;

REVOKE ALL     ON FUNCTION public.products_with_stock FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.products_with_stock FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.products_with_stock TO service_role;


-- ────────────────────────────────────────────────────────────────
-- 4) TypeScript pendiente (no incluido acá, es código no SQL):
--    app/api/products/update/route.ts tiene 2 llamadas
--    `.from("products").update({...})` directas (modo manual y modo
--    cálculo, usadas por /catalogo) que también deberían agregar
--    price_updated_at: new Date().toISOString() cuando el precio
--    cambia — es el único otro lugar que escribe products.price
--    fuera de bulk_update_product_prices_v3.
--
--    Y en app/etiquetas/page.tsx: agregar botón "Precios actualizados
--    recientemente (X días)" que llame /api/products/search con
--    price_filter existente + un nuevo campo recent_days, propagado
--    a p_recent_days en el RPC.
-- ────────────────────────────────────────────────────────────────
