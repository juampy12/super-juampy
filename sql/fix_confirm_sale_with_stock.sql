-- ================================================================
-- FIX URGENTE: confirm_sale_with_stock — stock nunca negativo
-- Usar GREATEST(stock - qty, 0) para satisfacer CHECK stock >= 0.
-- Registrar faltantes en stock_movements (reason='sale_stock_deficit').
--
-- Ejecutar en el SQL Editor de Supabase.
-- ================================================================

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
  v_sale_id   uuid;
  v_item      jsonb;
  v_prod      uuid;
  v_qty       numeric;
  v_price     numeric;
  v_cur_stock numeric;
  v_deficit   numeric;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No items';
  END IF;

  -- 1. Crear cabecera de venta
  INSERT INTO public.sales(store_id, total, payment, register_id, status)
  VALUES(p_store_id, COALESCE(p_total, 0), p_payment, p_register_id, 'confirmed')
  RETURNING id INTO v_sale_id;

  -- 2. Procesar cada ítem
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_prod  := (v_item->>'product_id')::uuid;
    v_qty   := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;

    IF v_prod IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Item inválido: %', v_item;
    END IF;

    -- Insertar ítem de venta
    INSERT INTO public.sale_items(sale_id, product_id, quantity, unit_price)
    VALUES(v_sale_id, v_prod, v_qty, v_price);

    -- Leer stock actual (NULL si no hay fila → tratar como 0)
    SELECT COALESCE(stock, 0) INTO v_cur_stock
    FROM public.product_stocks
    WHERE store_id = p_store_id AND product_id = v_prod;

    v_cur_stock := COALESCE(v_cur_stock, 0);

    -- Calcular faltante (0 si había suficiente stock)
    v_deficit := GREATEST(v_qty - v_cur_stock, 0);

    -- Descontar stock con piso en 0 — nunca viola CHECK (stock >= 0)
    UPDATE public.product_stocks
    SET stock = GREATEST(stock - v_qty, 0)
    WHERE store_id = p_store_id AND product_id = v_prod;

    -- Si no existía fila de stock, crear con 0
    IF NOT FOUND THEN
      INSERT INTO public.product_stocks(store_id, product_id, stock)
      VALUES(p_store_id, v_prod, 0)
      ON CONFLICT (store_id, product_id) DO NOTHING;
    END IF;

    -- Movimiento de stock normal (negativo)
    INSERT INTO public.stock_movements(store_id, product_id, qty, qty_delta, delta, reason, note, created_at)
    VALUES(p_store_id, v_prod, v_qty, -v_qty, -v_qty, 'sale', NULL, now());

    -- Registrar faltante para auditoría del supervisor
    IF v_deficit > 0 THEN
      INSERT INTO public.stock_movements(store_id, product_id, qty, qty_delta, delta, reason, note, created_at)
      VALUES(
        p_store_id,
        v_prod,
        v_deficit,
        v_deficit,
        v_deficit,
        'sale_stock_deficit',
        'Faltante: se vendieron ' || v_qty || ' unidades con solo ' || v_cur_stock || ' en stock',
        now()
      );
    END IF;
  END LOOP;

  RETURN v_sale_id;
END;
$$;

-- Asegurar que service_role puede ejecutar la función
GRANT EXECUTE ON FUNCTION public.confirm_sale_with_stock(uuid, jsonb, numeric, jsonb, uuid) TO service_role;
