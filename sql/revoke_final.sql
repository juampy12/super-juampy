-- ============================================================
-- REVOKE FINAL — HARDENING COMPLETO DE FUNCIONES SECURITY DEFINER
--
-- Contexto:
--   Todas las páginas (ventas, products, stock, etiquetas, minimos,
--   stock-bajo, reports/top-products) ya fueron migradas a API routes
--   server-side que usan supabaseAdmin (service_role key).
--   Ninguna función de este listado es llamada directamente desde
--   el cliente con la anon key en el código activo.
--
-- Nota sobre código muerto:
--   lib/sales.ts::confirmarVenta() llamaba a create_sale() con anon key.
--   Ese path está muerto — nada en app/ importa posConfirm.ts.
--   Igual se incluye en el REVOKE como medida de seguridad.
--
-- Ejecutar en: Supabase → SQL Editor → Run all
-- ============================================================


-- ── PASO 1: Auditoría previa ────────────────────────────────────────────────
-- Ver el estado actual antes de cualquier cambio. No modifica nada.

SELECT
  p.proname                                         AS function_name,
  pg_get_function_identity_arguments(p.oid)         AS arguments,
  CASE WHEN has_function_privilege('anon',          p.oid, 'EXECUTE') THEN '⚠ anon'          END AS anon_access,
  CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN '⚠ authenticated' END AS auth_access
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY p.proname;


-- ── PASO 2: Autodescubrimiento — cubre todo el schema public ───────────────
-- Garantiza que cualquier función SECURITY DEFINER quede hardened,
-- incluso si no aparece en la lista explícita de abajo.

DO $$
DECLARE
  r  RECORD;
  fn TEXT;
BEGIN
  FOR r IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    fn := 'public.' || quote_ident(r.proname) || '(' || r.args || ')';

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',         fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon',        fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated',fn);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role',  fn);

    RAISE NOTICE 'Hardened: %', fn;
  END LOOP;
END;
$$;


-- ── PASO 3: Sentencias explícitas por función ───────────────────────────────
-- Redundantes con el DO block, pero sirven como documentación exacta
-- de cada firma y como fallback si el autodescubrimiento fallara.

-- ── 3a. Empleados ───────────────────────────────────────────────────────────
-- Usadas server-side en /api/employees y /api/employee/login

REVOKE ALL     ON FUNCTION public.create_employee_with_pin(text, text, text, text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_employee_with_pin(text, text, text, text, uuid, uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_employee_with_pin(text, text, text, text, uuid, uuid) TO service_role;

REVOKE ALL     ON FUNCTION public.update_employee_pin(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_employee_pin(uuid, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_employee_pin(uuid, text) TO service_role;

-- verify_employee_pin: firma exacta obtenida de la DB via pg_proc en auditoría
-- Si falla el nombre sin parámetros, ver la salida de PASO 1 y ajustar.
REVOKE ALL     ON FUNCTION public.verify_employee_pin FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_employee_pin FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.verify_employee_pin TO service_role;


-- ── 3b. Ventas ──────────────────────────────────────────────────────────────
-- confirm_sale_with_stock: activa, usada en /api/pos/confirm
-- confirm_sale: legacy, reemplazada por confirm_sale_with_stock

REVOKE ALL     ON FUNCTION public.confirm_sale_with_stock(uuid, jsonb, numeric, jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_sale_with_stock(uuid, jsonb, numeric, jsonb, uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.confirm_sale_with_stock(uuid, jsonb, numeric, jsonb, uuid) TO service_role;

REVOKE ALL     ON FUNCTION public.confirm_sale(uuid, jsonb, numeric, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_sale(uuid, jsonb, numeric, jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.confirm_sale(uuid, jsonb, numeric, jsonb) TO service_role;

-- create_sale: legacy, llamada con anon key desde lib/sales.ts (código muerto —
-- nada en app/ lo importa). Igualmente bloqueada por seguridad.
REVOKE ALL     ON FUNCTION public.create_sale FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_sale FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_sale TO service_role;


-- ── 3c. Productos y búsqueda ────────────────────────────────────────────────
-- products_with_stock: usada en /api/products/search (supabaseAdmin)
-- products_top: tenía GRANT explícito a anon en products_top.sql — revertido acá

REVOKE ALL     ON FUNCTION public.products_with_stock FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.products_with_stock FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.products_with_stock TO service_role;

REVOKE ALL     ON FUNCTION public.products_top(timestamptz, timestamptz, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.products_top(timestamptz, timestamptz, uuid, integer) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.products_top(timestamptz, timestamptz, uuid, integer) TO service_role;


-- ── 3d. Stock ───────────────────────────────────────────────────────────────
-- set_min_stock:     usada en /api/stock/min (supabaseAdmin)
-- low_stock_products: su lógica fue reemplazada por queries directas en
--                     /api/stock/low, pero la función sigue en la DB.

REVOKE ALL     ON FUNCTION public.set_min_stock FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_min_stock FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.set_min_stock TO service_role;

REVOKE ALL     ON FUNCTION public.low_stock_products(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.low_stock_products(uuid, text, integer) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.low_stock_products(uuid, text, integer) TO service_role;


-- ── 3e. Reportes y top-productos ────────────────────────────────────────────
-- fn_top_products_range:     usada en /api/reports/top-products (supabaseAdmin)
-- fn_top_products_range_all: usada en /api/reports/top-products y
--                             /api/ai/assistant (ambos con supabaseAdmin)

REVOKE ALL     ON FUNCTION public.fn_top_products_range FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_top_products_range FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_top_products_range TO service_role;

REVOKE ALL     ON FUNCTION public.fn_top_products_range_all FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_top_products_range_all FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_top_products_range_all TO service_role;


-- ── 3f. Inteligencia ────────────────────────────────────────────────────────
-- Todas llamadas con supabaseAdmin en /api/intelligence/*

REVOKE ALL     ON FUNCTION public.margin_suggestions FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.margin_suggestions FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.margin_suggestions TO service_role;

REVOKE ALL     ON FUNCTION public.register_cash_diff FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_cash_diff FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.register_cash_diff TO service_role;

REVOKE ALL     ON FUNCTION public.register_risk FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_risk FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.register_risk TO service_role;


-- ── PASO 4: Verificación final ──────────────────────────────────────────────
-- Resultado esperado: 0 filas.
-- Si aparece alguna fila, esa función todavía tiene acceso público
-- y debe agregarse a las sentencias explícitas de arriba.

SELECT
  p.proname                                         AS function_name,
  pg_get_function_identity_arguments(p.oid)         AS arguments,
  CASE WHEN has_function_privilege('anon',          p.oid, 'EXECUTE') THEN 'anon'          END AS still_exposed_to_anon,
  CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'authenticated' END AS still_exposed_to_authenticated
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND (
    has_function_privilege('anon',          p.oid, 'EXECUTE')
    OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )
ORDER BY p.proname;

-- Si hay funciones con argumentos vacíos que fallaron con nombre-solo arriba,
-- ejecutar esta query para ver sus firmas exactas y repetir el REVOKE:
-- SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace AND prosecdef = true
-- AND proname IN ('verify_employee_pin','set_min_stock','margin_suggestions',
--                 'register_cash_diff','register_risk','create_sale',
--                 'products_with_stock','fn_top_products_range','fn_top_products_range_all');
