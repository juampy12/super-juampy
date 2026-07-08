-- ================================================================
-- FIX: doble descuento en confirm_sale_with_stock (nxm/second_unit_pct)
--
-- Bug encontrado en auditoría post-implementación (auditoria-motor-promos.md):
-- el TS de /api/pos/confirm mandaba el precio YA blended como unit_price,
-- y esta función lo volvía a blendear encima -> sale_items quedaba con el
-- descuento aplicado dos veces, aunque sales.total (que venía de p_total,
-- calculado una sola vez en el TS) fuera correcto.
--
-- Fix de fondo (principio: la RPC es la ÚNICA que aplica la matemática de
-- promos por cantidad):
--   1. El TS ahora manda SIEMPRE el precio de lista (o el ya resuelto por
--      percent/fixed_price) como unit_price — nunca el blended de nxm/
--      second_unit_pct. Esta función sigue siendo la que hace el blend.
--   2. Esta función deja de confiar en p_total: arma su propio total sumando
--      línea a línea lo que realmente graba en sale_items (imposible que
--      diverjan, por construcción). p_total queda solo para un RAISE NOTICE
--      de diagnóstico si algún día vuelve a discrepar.
--   3. Fix relacionado que apareció al diseñar esto: el agrupado por
--      product_id (agregado para nxm) también agrupaba las líneas de
--      balanza (scale_barcode) del mismo producto, perdiendo el precio real
--      si el mismo pesable se escaneó dos veces con precios distintos. Ahora
--      las líneas scale_barcode nunca se agrupan (mismo criterio que ya usa
--      el TS), se procesan en su propio loop.
--
-- Ejecutar en el SQL Editor de Supabase. CREATE OR REPLACE (misma firma,
-- mismo tipo de retorno uuid) — no requiere DROP ni volver a hacer GRANT.
-- ================================================================

CREATE OR REPLACE FUNCTION public.confirm_sale_with_stock(
  p_store_id    uuid,
  p_items       jsonb,   -- [{product_id, quantity, unit_price, source?: "scale_barcode"}]
  p_total       numeric, -- ya no se usa para el valor grabado; solo referencia para el NOTICE
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

  -- 0. Validar cada ítem crudo (antes de agrupar)
  FOR v_raw_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_raw_item->>'product_id') IS NULL
       OR (v_raw_item->>'quantity') IS NULL
       OR (v_raw_item->>'quantity')::numeric <= 0 THEN
      RAISE EXCEPTION 'Item inválido: %', v_raw_item;
    END IF;
  END LOOP;

  -- 1. Crear cabecera de venta con total provisorio (se corrige al final,
  --    una vez que sabemos la suma real de las líneas que vamos a grabar).
  INSERT INTO public.sales(store_id, total, payment, register_id, status)
  VALUES(p_store_id, 0, p_payment, p_register_id, 'confirmed')
  RETURNING id INTO v_sale_id;

  -- 2. Ítems de balanza: NUNCA se agrupan (cada escaneo es su propio precio
  --    real, aunque sea el mismo producto pesado dos veces por separado).
  --    Nunca llevan oferta nxm/second_unit_pct (bloqueadas para pesables).
  FOR v_scale_item IN
    SELECT
      (elem->>'product_id')::uuid   AS product_id,
      (elem->>'quantity')::numeric  AS quantity,
      (elem->>'unit_price')::numeric AS unit_price
    FROM jsonb_array_elements(p_items) AS elem
    WHERE elem->>'source' = 'scale_barcode'
  LOOP
    INSERT INTO public.sale_items(sale_id, product_id, quantity, unit_price, qty_buy, qty_pay, promo_pct)
    VALUES(v_sale_id, v_scale_item.product_id, v_scale_item.quantity, v_scale_item.unit_price, NULL, NULL, NULL);

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

  -- 3. Resto de los ítems: agrupar por product_id (hardening: si el mismo
  --    product_id viene en más de un renglón, se funden en una sola línea
  --    real), resolver la oferta ganadora y aplicar el blend UNA sola vez
  --    (acá, nunca en el TS).
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
    -- Elegir LA oferta ganadora entre TODAS las vigentes (sin filtro por
    -- type): si gana un percent/fixed_price de sucursal, el precio ya viene
    -- resuelto desde afuera (v_group.unit_price = precio de lista/resuelto)
    -- y no se le suma nada más.
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

    INSERT INTO public.sale_items(sale_id, product_id, quantity, unit_price, qty_buy, qty_pay, promo_pct)
    VALUES(v_sale_id, v_group.product_id, v_group.quantity, v_final_price, v_offer_qty_buy, v_offer_qty_pay, v_offer_pct);

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

  -- 4. Corregir el total del header con la suma real de las líneas grabadas.
  --    Nunca se confía en p_total para el valor final — solo se usa acá para
  --    loguear si el TS y la RPC llegaron a números distintos (no debería
  --    pasar salvo una carrera de milisegundos con un cambio de oferta justo
  --    entre que el TS valida el pago y esta función vuelve a leer la oferta).
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
