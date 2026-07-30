-- ================================================================
-- Módulo de proveedores — Etapa 3: filtro por proveedor en
-- products_with_stock (p_supplier_id opcional, aditivo).
--
-- p_supplier_id es TEXT (no uuid) para poder codificar 3 estados
-- con un solo parámetro: NULL = sin filtro, 'none' = productos sin
-- proveedor asignado, cualquier otro valor = ese supplier_id.
-- DEFAULT NULL: /ventas y /etiquetas, que llaman esta misma función
-- sin pasar este parámetro, no cambian de comportamiento.
--
-- Se dropea la firma anterior (5 params) antes de crear la de 6
-- para evitar dos overloads con parámetros opcionales solapados
-- ("function is not unique").
--
-- Ya aplicado en Supabase (2026-07-30). Este archivo es solo
-- documentación — el repo no despliega SQL automáticamente.
-- ================================================================

DROP FUNCTION IF EXISTS public.products_with_stock(uuid, text, integer, text, numeric);

CREATE FUNCTION public.products_with_stock(
  p_store uuid,
  p_query text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_price_filter text DEFAULT NULL::text,
  p_recent_hours numeric DEFAULT NULL::numeric,
  p_supplier_id text DEFAULT NULL::text
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
    AND (
      p_supplier_id IS NULL
      OR (p_supplier_id = 'none' AND p.supplier_id IS NULL)
      OR (p_supplier_id <> 'none' AND p.supplier_id = p_supplier_id::uuid)
    )
  ORDER BY
    CASE WHEN p_recent_hours IS NOT NULL THEN p.price_updated_at END DESC NULLS LAST,
    p.name
  LIMIT p_limit;
$function$;

REVOKE ALL     ON FUNCTION public.products_with_stock FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.products_with_stock FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.products_with_stock TO service_role;
