-- ================================================================
-- FEATURE: motor de promos por cantidad en product_offers
--   - nxm            ("llevá N, pagá M", ej. 2x1, 3x2)
--   - second_unit_pct ("2da unidad al X% de descuento")
--
-- Este archivo versiona el estado FINAL de todo lo aplicado a mano
-- en el SQL Editor de Supabase para esta feature (incluye los fixes
-- de constraints viejos que no estaban versionados: product_offers
-- ya tenía product_offers_type_check y product_offers_value_check
-- desde antes, sin fuente de verdad en el repo).
--
-- Ejecutar en el SQL Editor de Supabase. Todo es idempotente
-- (columnas con IF NOT EXISTS, constraints con DROP IF EXISTS antes
-- de recrear, funciones con CREATE OR REPLACE salvo donde se indica).
-- ================================================================

-- ─────────────────────────────────────────────────────────────────
-- a) product_offers: columnas para nxm / second_unit_pct
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.product_offers
  ADD COLUMN IF NOT EXISTS qty_buy integer,
  ADD COLUMN IF NOT EXISTS qty_pay integer;

-- ─────────────────────────────────────────────────────────────────
-- b) product_offers_type_check — constraint preexistente (no
--    versionado) que solo permitía 'fixed_price' y 'percent'.
--    Se amplía para admitir los dos tipos nuevos.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.product_offers DROP CONSTRAINT IF EXISTS product_offers_type_check;

ALTER TABLE public.product_offers
  ADD CONSTRAINT product_offers_type_check
  CHECK (type = ANY (ARRAY['fixed_price'::text, 'percent'::text, 'nxm'::text, 'second_unit_pct'::text]));

-- ─────────────────────────────────────────────────────────────────
-- c) product_offers_value_check — constraint preexistente (no
--    versionado) que exigía value > 0 siempre. Rompía nxm, que graba
--    value = 0 (el precio de nxm no depende de esta columna).
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.product_offers DROP CONSTRAINT IF EXISTS product_offers_value_check;

ALTER TABLE public.product_offers
  ADD CONSTRAINT product_offers_value_check
  CHECK ((type = 'nxm' AND value >= 0) OR (type <> 'nxm' AND value > 0));

-- ─────────────────────────────────────────────────────────────────
-- d) Coherencia qty_buy/qty_pay según el tipo de oferta:
--    - nxm: ambos NOT NULL, qty_buy > qty_pay >= 1
--    - second_unit_pct: qty_buy = 2 fijo, qty_pay NULL, 0 < value < 100
--    - resto de tipos: ambos NULL
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.product_offers DROP CONSTRAINT IF EXISTS chk_product_offers_nxm_coherence;
ALTER TABLE public.product_offers DROP CONSTRAINT IF EXISTS chk_product_offers_promo_coherence;

ALTER TABLE public.product_offers
  ADD CONSTRAINT chk_product_offers_promo_coherence
  CHECK (
    (type NOT IN ('nxm', 'second_unit_pct') AND qty_buy IS NULL AND qty_pay IS NULL)
    OR
    (type = 'nxm' AND qty_buy IS NOT NULL AND qty_pay IS NOT NULL
     AND qty_buy > qty_pay AND qty_pay >= 1)
    OR
    (type = 'second_unit_pct' AND qty_buy = 2 AND qty_pay IS NULL
     AND value > 0 AND value < 100)
  );

-- ─────────────────────────────────────────────────────────────────
-- e) sale_items — columnas informativas nullable (auditoría/ticket)
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS qty_buy integer,
  ADD COLUMN IF NOT EXISTS qty_pay integer,
  ADD COLUMN IF NOT EXISTS promo_pct numeric;

-- ─────────────────────────────────────────────────────────────────
-- f) products_with_stock — expone qty_buy/qty_pay de la oferta
--    vigente (requiere DROP porque cambia el RETURNS TABLE respecto
--    a la versión original, que no estaba versionada en el repo).
-- ─────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.products_with_stock(uuid, text, integer);

CREATE FUNCTION public.products_with_stock(p_store uuid, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 50)
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
  ORDER BY p.name
  LIMIT p_limit;
$function$;

REVOKE ALL     ON FUNCTION public.products_with_stock FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.products_with_stock FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.products_with_stock TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- g) confirm_sale_with_stock — agrupa por product_id (hardening),
--    elige UN ÚNICO ganador entre TODAS las ofertas vigentes (mismo
--    criterio sucursal>global que products_with_stock, sin filtrar
--    por type — evita doble descuento cuando coexisten una oferta
--    percent/fixed_price de sucursal con una nxm/second_unit_pct
--    global), y recién después bifurca según v_offer.type. Mantiene
--    TODO lo demás idéntico (deficit, stock_movements, GREATEST piso
--    0, patrón REVOKE/GRANT de siempre).
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_sale_with_stock(
  p_store_id    uuid,
  p_items       jsonb,   -- [{product_id, quantity, unit_price}]
  p_total       numeric,
  p_payment     jsonb,
  p_register_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id       uuid;
  v_raw_item      jsonb;
  v_group         RECORD;
  v_offer         RECORD;
  v_cur_stock     numeric;
  v_deficit       numeric;
  v_full_groups   numeric;
  v_remainder     numeric;
  v_billed_units  numeric;
  v_final_price   numeric;
  v_offer_qty_buy integer;
  v_offer_qty_pay integer;
  v_offer_pct     numeric;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No items';
  END IF;

  -- 0. Validar cada ítem crudo (antes de agrupar)
  FOR v_raw_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_raw_item->>'product_id') IS NULL
       OR (v_raw_item->>'quantity') IS NULL
       OR (v_raw_item->>'quantity')::numeric <= 0 THEN
      RAISE EXCEPTION 'Item inválido: %', v_raw_item;
    END IF;
  END LOOP;

  -- 1. Crear cabecera de venta
  INSERT INTO public.sales(store_id, total, payment, register_id, status)
  VALUES(p_store_id, COALESCE(p_total, 0), p_payment, p_register_id, 'confirmed')
  RETURNING id INTO v_sale_id;

  -- 2. Procesar por producto agrupado (hardening: si el mismo product_id
  --    viene en más de un renglón del carrito, se funden en una sola línea real)
  FOR v_group IN
    WITH items AS (
      SELECT
        (elem->>'product_id')::uuid  AS product_id,
        (elem->>'quantity')::numeric AS quantity,
        (elem->>'unit_price')::numeric AS unit_price,
        ord
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(elem, ord)
    )
    SELECT
      product_id,
      SUM(quantity) AS quantity,
      (array_agg(unit_price ORDER BY ord))[1] AS unit_price
    FROM items
    GROUP BY product_id
  LOOP
    -- Elegir LA oferta ganadora entre TODAS las vigentes (sin filtro por
    -- type): si gana un percent/fixed_price de sucursal, el precio ya
    -- viene resuelto desde afuera (v_group.unit_price) y no se le suma nada.
    SELECT po.type, po.value, po.qty_buy, po.qty_pay
      INTO v_offer
    FROM public.product_offers po
    WHERE po.product_id = v_group.product_id
      AND po.is_active = true
      AND po.starts_at <= now()
      AND po.ends_at >= now()
      AND (po.store_id = p_store_id OR po.store_id IS NULL)
    ORDER BY (po.store_id = p_store_id) DESC, po.created_at DESC
    LIMIT 1;

    IF FOUND AND v_offer.type = 'nxm' THEN
      v_offer_qty_buy := v_offer.qty_buy;
      v_offer_qty_pay := v_offer.qty_pay;
      v_offer_pct     := NULL;

      v_full_groups  := floor(v_group.quantity / v_offer_qty_buy);
      v_remainder    := v_group.quantity - (v_full_groups * v_offer_qty_buy);
      v_billed_units := (v_full_groups * v_offer_qty_pay) + v_remainder;
      v_final_price  := ROUND((v_billed_units * v_group.unit_price) / v_group.quantity, 2);

    ELSIF FOUND AND v_offer.type = 'second_unit_pct' THEN
      v_offer_qty_buy := 2;
      v_offer_qty_pay := NULL;
      v_offer_pct     := v_offer.value;

      v_full_groups  := floor(v_group.quantity / 2);
      v_remainder    := v_group.quantity - (v_full_groups * 2);
      v_billed_units := (v_full_groups * (2 - v_offer_pct / 100.0)) + v_remainder;
      v_final_price  := ROUND((v_billed_units * v_group.unit_price) / v_group.quantity, 2);

    ELSE
      -- Ganador es 'percent' / 'fixed_price' (precio ya resuelto por el TS
      -- en v_group.unit_price) o no hay oferta vigente: no se toca el precio.
      v_offer_qty_buy := NULL;
      v_offer_qty_pay := NULL;
      v_offer_pct     := NULL;
      v_final_price   := v_group.unit_price;
    END IF;

    -- Insertar ítem de venta (quantity = unidades reales, unit_price = precio blended)
    INSERT INTO public.sale_items(sale_id, product_id, quantity, unit_price, qty_buy, qty_pay, promo_pct)
    VALUES(v_sale_id, v_group.product_id, v_group.quantity, v_final_price, v_offer_qty_buy, v_offer_qty_pay, v_offer_pct);

    -- Leer stock actual (NULL si no hay fila → tratar como 0)
    SELECT COALESCE(stock, 0) INTO v_cur_stock
    FROM public.product_stocks
    WHERE store_id = p_store_id AND product_id = v_group.product_id;

    v_cur_stock := COALESCE(v_cur_stock, 0);

    -- Calcular faltante (0 si había suficiente stock)
    v_deficit := GREATEST(v_group.quantity - v_cur_stock, 0);

    -- Descontar stock con piso en 0 — nunca viola CHECK (stock >= 0)
    UPDATE public.product_stocks
    SET stock = GREATEST(stock - v_group.quantity, 0)
    WHERE store_id = p_store_id AND product_id = v_group.product_id;

    -- Si no existía fila de stock, crear con 0
    IF NOT FOUND THEN
      INSERT INTO public.product_stocks(store_id, product_id, stock)
      VALUES(p_store_id, v_group.product_id, 0)
      ON CONFLICT (store_id, product_id) DO NOTHING;
    END IF;

    -- Movimiento de stock normal (negativo)
    INSERT INTO public.stock_movements(store_id, product_id, qty, qty_delta, delta, reason, note, created_at)
    VALUES(p_store_id, v_group.product_id, v_group.quantity, -v_group.quantity, -v_group.quantity, 'sale', NULL, now());

    -- Registrar faltante para auditoría del supervisor
    IF v_deficit > 0 THEN
      INSERT INTO public.stock_movements(store_id, product_id, qty, qty_delta, delta, reason, note, created_at)
      VALUES(
        p_store_id,
        v_group.product_id,
        v_deficit,
        v_deficit,
        v_deficit,
        'sale_stock_deficit',
        'Faltante: se vendieron ' || v_group.quantity || ' unidades con solo ' || v_cur_stock || ' en stock',
        now()
      );
    END IF;
  END LOOP;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_sale_with_stock(uuid, jsonb, numeric, jsonb, uuid) TO service_role;

REVOKE ALL     ON FUNCTION public.confirm_sale_with_stock(uuid, jsonb, numeric, jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_sale_with_stock(uuid, jsonb, numeric, jsonb, uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.confirm_sale_with_stock(uuid, jsonb, numeric, jsonb, uuid) TO service_role;
