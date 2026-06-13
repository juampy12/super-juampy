-- ============================================================
-- HARDENING: REVOCAR EXECUTE DE PUBLIC/ANON/AUTHENTICATED
-- EN TODAS LAS FUNCIONES SECURITY DEFINER DEL SCHEMA PUBLIC
--
-- Después de ejecutar esto, SOLO service_role (clave de servidor)
-- puede invocar estas funciones. La anon key y authenticated
-- quedan bloqueadas para llamadas RPC directas desde el cliente.
--
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- ============================================================


-- ── PASO 1: Ver qué funciones SECURITY DEFINER existen ahora ──────────────
-- (Ejecutar primero para auditar. No modifica nada.)

SELECT
  p.proname                                           AS function_name,
  pg_get_function_identity_arguments(p.oid)           AS arguments,
  'public.' || p.proname || '('
    || pg_get_function_identity_arguments(p.oid)
    || ')'                                            AS full_signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY p.proname;


-- ── PASO 2: Revocar en TODAS las funciones SECURITY DEFINER ───────────────
-- Autodescubrimiento: funciona aunque el schema cambie en el futuro.

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
    fn := 'public.' || quote_ident(r.proname)
            || '(' || r.args || ')';

    -- Revoca el permiso por defecto que PostgreSQL otorga a PUBLIC en CADA función
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',        fn);
    -- Revoca de los roles de Supabase que representan la anon key y JWTs de usuarios
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon',        fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated',fn);
    -- Garantiza que el service_role (clave de servidor, nunca expuesta al cliente) sí puede
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',   fn);

    RAISE NOTICE 'Hardened: %', fn;
  END LOOP;
END;
$$;


-- ── PASO 3: Sentencias explícitas para las funciones conocidas ─────────────
-- (Redundantes con el DO block de arriba, pero sirven como documentación
--  y como fallback si alguna función no fuera detectada por prosecdef.)

-- 3a. Empleados — NUNCA deben ser invocables desde el cliente
REVOKE ALL     ON FUNCTION public.create_employee_with_pin(text, text, text, text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_employee_with_pin(text, text, text, text, uuid, uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_employee_with_pin(text, text, text, text, uuid, uuid) TO service_role;

REVOKE ALL     ON FUNCTION public.update_employee_pin(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_employee_pin(uuid, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_employee_pin(uuid, text) TO service_role;

-- 3b. Login — NUNCA debe ser invocable desde el cliente (compara PIN)
REVOKE ALL     ON FUNCTION public.verify_employee_pin FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_employee_pin FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.verify_employee_pin TO service_role;

-- 3c. Ventas — NUNCA deben ser invocables desde el cliente
REVOKE ALL     ON FUNCTION public.confirm_sale_with_stock(uuid, jsonb, numeric, jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_sale_with_stock(uuid, jsonb, numeric, jsonb, uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.confirm_sale_with_stock(uuid, jsonb, numeric, jsonb, uuid) TO service_role;

REVOKE ALL     ON FUNCTION public.confirm_sale(uuid, jsonb, numeric, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_sale(uuid, jsonb, numeric, jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.confirm_sale(uuid, jsonb, numeric, jsonb) TO service_role;

REVOKE ALL     ON FUNCTION public.create_sale(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_sale(uuid, jsonb, jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_sale(uuid, jsonb, jsonb) TO service_role;

-- 3d. Reportes/inteligencia — actualmente llamadas server-side con supabaseAdmin
REVOKE ALL     ON FUNCTION public.products_top(timestamptz, timestamptz, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.products_top(timestamptz, timestamptz, uuid, integer) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.products_top(timestamptz, timestamptz, uuid, integer) TO service_role;

REVOKE ALL     ON FUNCTION public.margin_suggestions FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.margin_suggestions FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.margin_suggestions TO service_role;

REVOKE ALL     ON FUNCTION public.register_cash_diff FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_cash_diff FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.register_cash_diff TO service_role;

REVOKE ALL     ON FUNCTION public.register_risk FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_risk FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.register_risk TO service_role;

-- 3e. Las funciones de lectura de productos/stock — actualmente llamadas con anon key
--     desde el cliente (ventas, productos, stock, etiquetas, minimos, stock-bajo).
--     ROMPERÁN esas páginas hasta que se migren a API routes con supabaseAdmin.
--     Incluirlas igual porque el riesgo de exposición directa es inaceptable.
REVOKE ALL     ON FUNCTION public.products_with_stock FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.products_with_stock FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.products_with_stock TO service_role;

REVOKE ALL     ON FUNCTION public.fn_top_products_range FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_top_products_range FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_top_products_range TO service_role;

REVOKE ALL     ON FUNCTION public.fn_top_products_range_all FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_top_products_range_all FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_top_products_range_all TO service_role;

REVOKE ALL     ON FUNCTION public.set_min_stock FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_min_stock FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.set_min_stock TO service_role;

REVOKE ALL     ON FUNCTION public.low_stock_products FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.low_stock_products FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.low_stock_products TO service_role;


-- ── PASO 4: Verificar el resultado ────────────────────────────────────────
-- Ejecutar después del DO block para confirmar que no queda EXECUTE a PUBLIC/anon/authenticated.
-- Resultado esperado: 0 filas.

SELECT
  p.proname       AS function_name,
  r.rolname       AS role_with_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_proc_acl   ON pg_proc_acl.oid = p.oid  -- no existe; usar has_function_privilege abajo
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND (
    has_function_privilege('anon',          p.oid, 'EXECUTE')
    OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
    OR has_function_privilege('PUBLIC',       p.oid, 'EXECUTE')
  );
-- Nota: "PUBLIC" en has_function_privilege no es válido directamente;
-- usar la query alternativa de abajo.

-- Query alternativa de verificación (más confiable):
SELECT
  p.proname AS function_name,
  'anon tiene EXECUTE' AS riesgo
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND has_function_privilege('anon', p.oid, 'EXECUTE')

UNION ALL

SELECT
  p.proname,
  'authenticated tiene EXECUTE'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE')

ORDER BY function_name;
-- Resultado esperado tras ejecutar el DO block: 0 filas.
