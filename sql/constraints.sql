-- ================================================================
-- Super Juampy POS — Constraints de DB
-- Orden: cleanup de datos → FK → CHECK → NOT NULL → tabla cache AI
-- ================================================================


-- ── 1. LIMPIEZA DE DATOS ─────────────────────────────────────────

-- Corregir stocks negativos (A.M.VILLA DEL SUR en 2 sucursales)
UPDATE product_stocks SET stock = 0 WHERE stock < 0;

-- Eliminar filas de stock de productos que ya no existen (186 productos, 556 filas)
DELETE FROM product_stocks
  WHERE product_id NOT IN (SELECT id FROM products);

-- Eliminar movimientos de stock de productos que ya no existen (171 productos, 571 filas)
DELETE FROM stock_movements
  WHERE product_id NOT IN (SELECT id FROM products);


-- ── 2. FOREIGN KEYS ──────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE sale_items
    ADD CONSTRAINT fk_sale_items_sale
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- OMITIDO: fk_sale_items_product (sale_items.product_id → products)
-- Motivo: 46 items históricos referencian productos eliminados físicamente.
-- Agregar este FK borraría o bloquearía datos de ventas pasadas.

DO $$ BEGIN
  ALTER TABLE product_stocks
    ADD CONSTRAINT fk_product_stocks_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE product_stocks
    ADD CONSTRAINT fk_product_stocks_store
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE stock_movements
    ADD CONSTRAINT fk_stock_movements_product
    FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE stock_movements
    ADD CONSTRAINT fk_stock_movements_store
    FOREIGN KEY (store_id) REFERENCES stores(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE registers
    ADD CONSTRAINT fk_registers_store
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE sales
    ADD CONSTRAINT fk_sales_store
    FOREIGN KEY (store_id) REFERENCES stores(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE sales
    ADD CONSTRAINT fk_sales_register
    FOREIGN KEY (register_id) REFERENCES registers(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE cash_closures
    ADD CONSTRAINT fk_cash_closures_store
    FOREIGN KEY (store_id) REFERENCES stores(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE cash_closures
    ADD CONSTRAINT fk_cash_closures_register
    FOREIGN KEY (register_id) REFERENCES registers(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;


-- ── 3. CHECK CONSTRAINTS ─────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT chk_products_price_positive
    CHECK (price IS NULL OR price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT chk_products_cost_net_positive
    CHECK (cost_net IS NULL OR cost_net >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT chk_products_vat_rate_range
    CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100));
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT chk_products_markup_rate_positive
    CHECK (markup_rate IS NULL OR markup_rate >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE sale_items ADD CONSTRAINT chk_sale_items_quantity_positive
    CHECK (quantity > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE sale_items ADD CONSTRAINT chk_sale_items_unit_price_positive
    CHECK (unit_price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE sales ADD CONSTRAINT chk_sales_total_positive
    CHECK (total >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE product_stocks ADD CONSTRAINT chk_product_stocks_stock_positive
    CHECK (stock >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;


-- ── 4. NOT NULL ───────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE sale_items ALTER COLUMN sale_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE sale_items ALTER COLUMN quantity SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE sale_items ALTER COLUMN unit_price SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE sales ALTER COLUMN status SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE sales ALTER COLUMN total SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END; $$;


-- ── 5. TABLA CACHE AI ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_business_cache (
  key        TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_business_cache_expires
  ON ai_business_cache (expires_at);

ALTER TABLE ai_business_cache ENABLE ROW LEVEL SECURITY;
-- Sin policies = solo service_role accede (correcto para cache interno)


-- ── FIN ───────────────────────────────────────────────────────────
