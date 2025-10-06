-- === FIX CONFIRMAR VENTA (Super Juampy) ===
-- Asegurar extensiones para UUID
create extension if not exists pgcrypto;

-- === Tablas mínimas ===
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  cashier_id uuid,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null,
  product_id uuid not null,
  quantity numeric(12,3) not null default 1,
  unit_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Asegurar columnas críticas si ya existían tablas viejas
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sale_items' and column_name='unit_price'
  ) then
    alter table public.sale_items add column unit_price numeric(12,2) not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sale_items' and column_name='quantity'
  ) then
    alter table public.sale_items add column quantity numeric(12,3) not null default 1;
  end if;
end$$;

-- FKs si existen las tablas referenciadas
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='fk_sale_items_sale'
  ) then
    alter table public.sale_items
      add constraint fk_sale_items_sale
      foreign key (sale_id) references public.sales(id) on delete cascade;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='products'
  ) and not exists (
    select 1 from pg_constraint where conname='fk_sale_items_product'
  ) then
    alter table public.sale_items
      add constraint fk_sale_items_product
      foreign key (product_id) references public.products(id);
  end if;
end$$;

-- === RLS ===
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

-- Políticas mínimas de lectura
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='sales' and policyname='read_sales'
  ) then
    create policy read_sales on public.sales
      for select to authenticated, service_role
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='sale_items' and policyname='read_sale_items'
  ) then
    create policy read_sale_items on public.sale_items
      for select to authenticated, service_role
      using (true);
  end if;
end$$;

-- === RPC Confirmar venta ===
drop function if exists public.create_sale(uuid, jsonb, jsonb);

create or replace function public.create_sale(
  p_store uuid,
  p_items jsonb,
  p_meta  jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale   uuid;
  v_total  numeric(12,2) := 0;
  rec      jsonb;
  v_pid    uuid;
  v_qty    numeric(12,3);
  v_price  numeric(12,2);
begin
  insert into public.sales (store_id, total)
  values (p_store, 0)
  returning id into v_sale;

  for rec in select * from jsonb_array_elements(p_items)
  loop
    v_pid   := (rec->>'product_id')::uuid;
    v_qty   := coalesce((rec->>'quantity')::numeric, 1);
    v_price := coalesce((rec->>'unit_price')::numeric, 0);

    insert into public.sale_items (sale_id, product_id, quantity, unit_price)
    values (v_sale, v_pid, v_qty, v_price);

    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='products' and column_name='stock'
    ) then
      update public.products
      set stock = stock - v_qty
      where id = v_pid;
    end if;

    v_total := v_total + (v_qty * v_price);
  end loop;

  update public.sales set total = round(v_total, 2) where id = v_sale;

  return v_sale;
end;
$$;

grant execute on function public.create_sale(uuid, jsonb, jsonb) to anon, authenticated, service_role;

-- === Vista de reportes ===
drop view if exists public.v_sales_daily;
create view public.v_sales_daily as
select
  date_trunc('day', s.created_at)::date as date,
  s.store_id,
  count(*)::int                                     as tickets,
  sum(si.quantity)::numeric(12,3)                   as items,
  sum(si.quantity * si.unit_price)::numeric(12,2)   as total
from public.sales s
join public.sale_items si on si.sale_id = s.id
group by 1,2
order by 1 desc;

grant select on public.v_sales_daily to anon, authenticated, service_role;
