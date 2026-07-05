-- ================================================================
-- Super Juampy POS — Agregar columna faltante products.plu
-- ================================================================
-- El código (app/api/products/catalog, update-plu, by-plu y la
-- pestaña Editar/Desactivar de /catalogo) ya lee y escribe products.plu,
-- pero la columna nunca se creó en la base. Esto rompe TODA búsqueda
-- en /catalogo → Editar/Desactivar con:
--   column products.plu does not exist (42703)

ALTER TABLE products ADD COLUMN IF NOT EXISTS plu text;

-- PostgREST cachea el schema; sin este reload, la API puede seguir
-- devolviendo "column does not exist" un rato después del ALTER.
NOTIFY pgrst, 'reload schema';
