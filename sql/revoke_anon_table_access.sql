-- Cierra el acceso directo por anon/authenticated a tablas y vistas del schema public.
-- La app debe acceder a datos por API routes server-side con service_role.
--
-- Ejecutar en Supabase SQL Editor despues de desplegar la migracion client->API.

begin;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- Defensa extra para tablas base sensibles. No afecta service_role.
alter table if exists public.products enable row level security;
alter table if exists public.product_stocks enable row level security;
alter table if exists public.stock_movements enable row level security;
alter table if exists public.sales enable row level security;
alter table if exists public.sale_items enable row level security;
alter table if exists public.cash_closures enable row level security;
alter table if exists public.stores enable row level security;
alter table if exists public.registers enable row level security;
alter table if exists public.product_offers enable row level security;
alter table if exists public.product_min_stock enable row level security;
alter table if exists public.employees enable row level security;

commit;

-- Verificacion: idealmente no debe devolver filas para anon/authenticated.
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
