-- ================================================================
-- Módulo de proveedores — Etapa 1: tabla suppliers + supplier_id
-- en products.
--
-- Aditivo y reversible: supplier_id es nullable sin DEFAULT propio,
-- así que los productos existentes quedan sin proveedor asignado
-- hasta que se les asigne uno. No toca products_with_stock,
-- bulk_update_product_prices_v3, ni ninguna función existente.
--
-- Ya aplicado en Supabase (2026-07-30). Este archivo es solo
-- documentación — el repo no despliega SQL automáticamente.
-- ================================================================

begin;

create table if not exists public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ON DELETE SET NULL: si se borra un proveedor, sus productos quedan
-- sin asignar en vez de bloquear el DELETE.
alter table public.products
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

create index if not exists idx_products_supplier_id
  on public.products (supplier_id);

-- Misma convención de seguridad que el resto de las tablas base
-- (ver sql/revoke_anon_table_access.sql): nada de acceso directo
-- para anon/authenticated, todo pasa por las API routes con
-- service_role (que tiene BYPASSRLS, no hace falta ninguna policy).
revoke all on public.suppliers from anon, authenticated;
alter table public.suppliers enable row level security;

commit;
