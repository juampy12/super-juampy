SET client_encoding = ''UTF8'';

BEGIN;

-- Totales por venta
CREATE OR REPLACE VIEW public.v_sales AS
SELECT
  s.id AS sale_id,
  s.created_at AS created_at_utc,
  (s.created_at AT TIME ZONE ''UTC'' AT TIME ZONE ''America/Argentina/Cordoba'') AS created_at_local,
  COALESCE(SUM(si.qty), 0)  AS items,
  COALESCE(SUM(si.subtotal), 0) AS total
FROM public.sales s
LEFT JOIN public.sale_items si ON si.sale_id = s.id
GROUP BY s.id, s.created_at;

-- Totales por dia (incluye columna date)
CREATE OR REPLACE VIEW public.v_sales_daily AS
SELECT
  ((s.created_at AT TIME ZONE ''UTC'' AT TIME ZONE ''America/Argentina/Cordoba'')::date) AS date,
  COUNT(DISTINCT s.id)  AS sales_count,
  COALESCE(SUM(si.qty), 0) AS units,
  COALESCE(SUM(si.subtotal), 0) AS total
FROM public.sales s
LEFT JOIN public.sale_items si ON si.sale_id = s.id
GROUP BY 1
ORDER BY 1 DESC;

COMMIT;
