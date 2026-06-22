-- ================================================================
-- void_sale_atomic
-- Reemplaza la secuencia de 4 llamadas separadas que hacía
-- /api/sales/void (SELECT stock, UPSERT product_stocks, INSERT
-- stock_movements, UPDATE sales) por una sola función PL/pgSQL.
-- Atomicidad implícita de Postgres: si cualquier paso falla, toda
-- la función se revierte (no queda stock devuelto sin venta
-- anulada, ni venta anulada sin stock devuelto).
--
-- SELECT ... FOR UPDATE bloquea la fila de la venta para evitar que
-- dos voids concurrentes sobre la misma venta devuelvan el stock
-- dos veces (idempotencia ante condición de carrera).
--
-- La autorización (rol de sesión, aislamiento por sucursal/caja del
-- cajero que pide el void) se sigue validando en route.ts ANTES de
-- llamar a esta función — esta función solo garantiza integridad
-- de datos, no hace control de acceso (por eso SECURITY DEFINER +
-- GRANT exclusivo a service_role).
--
-- Ejecutar en el SQL Editor de Supabase.
-- ================================================================

CREATE OR REPLACE FUNCTION public.void_sale_atomic(
  p_sale_id                 uuid,
  p_reason                  text,
  p_void_authorized_by      uuid,
  p_void_authorized_code    text,
  p_void_authorized_name    text,
  p_voided_by               uuid,
  p_voided_by_role          text,
  p_voided_from_store_id    uuid,
  p_voided_from_register_id uuid
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale    record;
  v_item    record;
  v_now     timestamptz := now();
  v_payment jsonb;
BEGIN
  -- Lock de la fila de venta: evita que dos voids concurrentes
  -- sobre la misma venta devuelvan stock dos veces.
  SELECT s.id, s.status, s.store_id, s.register_id, s.payment
    INTO v_sale
  FROM public.sales s
  WHERE s.id = p_sale_id
  FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'sale_not_found';
  END IF;

  IF v_sale.status = 'anulada' THEN
    RAISE EXCEPTION 'sale_already_voided';
  END IF;

  IF v_sale.status <> 'confirmed' THEN
    RAISE EXCEPTION 'sale_not_confirmed';
  END IF;

  -- Devolver stock de cada item (si la venta tiene store_id; igual
  -- que el código TS original, que omitía la devolución si era NULL).
  IF v_sale.store_id IS NOT NULL THEN
    FOR v_item IN
      SELECT product_id, quantity
      FROM public.sale_items
      WHERE sale_id = p_sale_id
        AND product_id IS NOT NULL
        AND quantity > 0
    LOOP
      INSERT INTO public.product_stocks (store_id, product_id, stock)
      VALUES (v_sale.store_id, v_item.product_id, v_item.quantity)
      ON CONFLICT (store_id, product_id)
      DO UPDATE SET stock = product_stocks.stock + EXCLUDED.stock;

      INSERT INTO public.stock_movements
        (store_id, product_id, qty, qty_delta, delta, reason, note, created_at)
      VALUES (
        v_sale.store_id,
        v_item.product_id,
        v_item.quantity,
        v_item.quantity,
        v_item.quantity,
        'void_sale',
        'Anulación de venta ' || p_sale_id ||
          '. Autorizó ' || COALESCE(p_void_authorized_code, '') ||
          '. Motivo: ' || COALESCE(p_reason, ''),
        v_now
      );
    END LOOP;
  END IF;

  -- Marcar la venta como anulada, fusionando metadata de auditoría
  -- en el mismo JSONB payment que usaba el código TS original.
  v_payment := COALESCE(v_sale.payment, '{}'::jsonb) || jsonb_build_object(
    'voided_at', v_now,
    'voided_by', p_voided_by,
    'voided_by_role', p_voided_by_role,
    'voided_from_store_id', p_voided_from_store_id,
    'voided_from_register_id', p_voided_from_register_id,
    'void_authorized_by', p_void_authorized_by,
    'void_authorized_code', p_void_authorized_code,
    'void_authorized_name', p_void_authorized_name,
    'void_reason', p_reason,
    'void_sale_store_id', v_sale.store_id,
    'void_sale_register_id', v_sale.register_id
  );

  UPDATE public.sales
  SET status = 'anulada', payment = v_payment
  WHERE id = p_sale_id;

  RETURN v_now;
END;
$$;

REVOKE ALL     ON FUNCTION public.void_sale_atomic(uuid, text, uuid, text, text, uuid, text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.void_sale_atomic(uuid, text, uuid, text, text, uuid, text, uuid, uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.void_sale_atomic(uuid, text, uuid, text, text, uuid, text, uuid, uuid) TO service_role;
