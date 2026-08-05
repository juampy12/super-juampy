-- ================================================================
-- Agregar columna sale_items.source — persistir origen "balanza"
-- ================================================================
-- Hoy sale_items no guarda si un ítem vino de una etiqueta de balanza
-- (source: "scale_barcode"). El dato existe transitoriamente en el
-- flujo de confirmación pero se descarta al insertar, así que una vez
-- grabada la venta un pesable por balanza es indistinguible de un
-- producto normal vendido "1 unidad" (ver docs/auditoria-pesables.md).
--
-- ADITIVO y NULL-safe: no rompe filas existentes ni ventas normales
-- (quedan con source = NULL). No cambia precio, stock ni cierre de caja.
--
-- Ejecutar en el SQL Editor de Supabase. CREATE OR REPLACE (misma
-- firma) — no requiere DROP ni volver a hacer GRANT.
-- ================================================================

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS source text DEFAULT NULL;

-- PostgREST cachea el schema; sin este reload, la API puede seguir
-- devolviendo "column does not exist" un rato después del ALTER.
NOTIFY pgrst, 'reload schema';

-- ================================================================
-- confirm_sale_with_stock — persistir source en los dos INSERT
-- ================================================================
-- Mismo cuerpo que sql/fix_confirm_sale_double_discount.sql, con UN
-- solo cambio real: agregar la columna `source` a los dos INSERT INTO
-- sale_items ('scale_barcode' en el bloque de balanza, NULL en el
-- agrupado). Todo el resto (cálculo de precio, stock, ofertas, total)
-- queda idéntico.

CREATE OR REPLACE FUNCTION public.confirm_sale_with_stock(
  p_store_id    uuid,
  p_items       jsonb,
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
  v_scale_item    RECORD;
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
  v_sale_total    numeric := 0;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No items';
  END IF;

  FOR v_raw_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_raw_item->>'product_id') IS NULL
       OR (v_raw_item->>'quantity') IS NULL
       OR (v_raw_item->>'quantity')::numeric <= 0 THEN
      RAISE EXCEPTION 'Item inválido: %', v_raw_item;
    END IF;
  END LOOP;

  INSERT INTO public.sales(store_id, total, payment, register_id, status)
  VALUES(p_store_id, 0, p_payment, p_register_id, 'confirmed')
  RETURNING id INTO v_sale_id;

  -- Ítems de balanza: nunca se agrupan. ÚNICO CAMBIO: agregar 'source'.
  FOR v_scale_item IN
    SELECT
      (elem->>'product_id')::uuid   AS product_id,
      (elem->>'quantity')::numeric  AS quantity,
      (elem->>'unit_price')::numeric AS unit_price
    FROM jsonb_array_elements(p_items) AS elem
    WHERE elem->>'source' = 'scale_barcode'
  LOOP
    INSERT INTO public.sale_items(sale_id, product_id, quantity, unit_price, qty_buy, qty_pay, promo_pct, source)
    VALUES(v_sale_id, v_scale_item.product_id, v_scale_item.quantity, v_scale_item.unit_price, NULL, NULL, NULL, 'scale_barcode');

    v_sale_total := v_sale_total + ROUND(v_scale_item.quantity * v_scale_item.unit_price, 2);

    SELECT COALESCE(stock, 0) INTO v_cur_stock
    FROM public.product_stocks
    WHERE store_id = p_store_id AND product_id = v_scale_item.product_id;
    v_cur_stock := COALESCE(v_cur_stock, 0);
    v_deficit := GREATEST(v_scale_item.quantity - v_cur_stock, 0);

    UPDATE public.product_stocks
    SET stock = GREATEST(stock - v_scale_item.quantity, 0)
    WHERE store_id = p_store_id AND product_id = v_scale_item.product_id;

    IF NOT FOUND THEN
      INSERT INTO public.product_stocks(store_id, product_id, stock)
      VALUES(p_store_id, v_scale_item.product_id, 0)
      ON CONFLICT (store_id, product_id) DO NOTHING;
    END IF;

    INSERT INTO public.stock_movements(store_id, product_id, qty, qty_delta, delta, reason, note, created_at)
    VALUES(p_store_id, v_scale_item.product_id, v_scale_item.quantity, -v_scale_item.quantity, -v_scale_item.quantity, 'sale', NULL, now());

    IF v_deficit > 0 THEN
      INSERT INTO public.stock_movements(store_id, product_id, qty, qty_delta, delta, reason, note, created_at)
      VALUES(
        p_store_id, v_scale_item.product_id, v_deficit, v_deficit, v_deficit,
        'sale_stock_deficit',
        'Faltante: se vendieron ' || v_scale_item.quantity || ' unidades con solo ' || v_cur_stock || ' en stock',
        now()
      );
    END IF;
  END LOOP;

  -- Resto de los ítems agrupados. ÚNICO CAMBIO: agregar 'source' = NULL.
  FOR v_group IN
    WITH items AS (
      SELECT
        (elem->>'product_id')::uuid  AS product_id,
        (elem->>'quantity')::numeric AS quantity,
        (elem->>'unit_price')::numeric AS unit_price,
        ord
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(elem, ord)
      WHERE COALESCE(elem->>'source', '') <> 'scale_barcode'
    )
    SELECT
      product_id,
      SUM(quantity) AS quantity,
      (array_agg(unit_price ORDER BY ord))[1] AS unit_price
    FROM items
    GROUP BY product_id
  LOOP
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
      v_offer_qty_buy := NULL;
      v_offer_qty_pay := NULL;
      v_offer_pct     := NULL;
      v_final_price   := v_group.unit_price;
    END IF;

    INSERT INTO public.sale_items(sale_id, product_id, quantity, unit_price, qty_buy, qty_pay, promo_pct, source)
    VALUES(v_sale_id, v_group.product_id, v_group.quantity, v_final_price, v_offer_qty_buy, v_offer_qty_pay, v_offer_pct, NULL);

    v_sale_total := v_sale_total + ROUND(v_final_price * v_group.quantity, 2);

    SELECT COALESCE(stock, 0) INTO v_cur_stock
    FROM public.product_stocks
    WHERE store_id = p_store_id AND product_id = v_group.product_id;
    v_cur_stock := COALESCE(v_cur_stock, 0);
    v_deficit := GREATEST(v_group.quantity - v_cur_stock, 0);

    UPDATE public.product_stocks
    SET stock = GREATEST(stock - v_group.quantity, 0)
    WHERE store_id = p_store_id AND product_id = v_group.product_id;

    IF NOT FOUND THEN
      INSERT INTO public.product_stocks(store_id, product_id, stock)
      VALUES(p_store_id, v_group.product_id, 0)
      ON CONFLICT (store_id, product_id) DO NOTHING;
    END IF;

    INSERT INTO public.stock_movements(store_id, product_id, qty, qty_delta, delta, reason, note, created_at)
    VALUES(p_store_id, v_group.product_id, v_group.quantity, -v_group.quantity, -v_group.quantity, 'sale', NULL, now());

    IF v_deficit > 0 THEN
      INSERT INTO public.stock_movements(store_id, product_id, qty, qty_delta, delta, reason, note, created_at)
      VALUES(
        p_store_id, v_group.product_id, v_deficit, v_deficit, v_deficit,
        'sale_stock_deficit',
        'Faltante: se vendieron ' || v_group.quantity || ' unidades con solo ' || v_cur_stock || ' en stock',
        now()
      );
    END IF;
  END LOOP;

  IF p_total IS NOT NULL AND abs(p_total - v_sale_total) > 0.02 THEN
    RAISE NOTICE 'confirm_sale_with_stock: p_total (%) difiere de v_sale_total (%) en sale %',
      p_total, v_sale_total, v_sale_id;
  END IF;

  UPDATE public.sales SET total = v_sale_total WHERE id = v_sale_id;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_sale_with_stock(uuid, jsonb, numeric, jsonb, uuid) TO service_role;

REVOKE ALL     ON FUNCTION public.confirm_sale_with_stock(uuid, jsonb, numeric, jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_sale_with_stock(uuid, jsonb, numeric, jsonb, uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.confirm_sale_with_stock(uuid, jsonb, numeric, jsonb, uuid) TO service_role;
