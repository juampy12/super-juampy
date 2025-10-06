-- === TABLAS (idempotentes) ===================================================
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid,
  total numeric not null,
  payment jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty numeric not null check (qty > 0),
  unit_price numeric not null,
  subtotal numeric generated always as (qty * unit_price) stored
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  delta numeric not null,
  reason text,
  sale_id uuid,
  created_at timestamptz not null default now()
);

-- Índices
create index if not exists idx_sales_created_at on public.sales(created_at);
create index if not exists idx_sales_store on public.sales(store_id);
create index if not exists idx_sale_items_sale on public.sale_items(sale_id);
create index if not exists idx_stock_movements_prod on public.stock_movements(product_id);

-- === FUNCIÓN: confirm_sale (transacción) =====================================
create or replace function public.confirm_sale(
  p_store_id uuid,
  p_items jsonb,   -- [{product_id, qty, unit_price}]
  p_total numeric,
  p_payment jsonb
)
returns json
language plpgsql
security definer
as $$
declare
  v_sale_id uuid;
  v_item jsonb;
  v_prod uuid;
  v_qty numeric;
  v_price numeric;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No items';
  end if;

  -- 1) Cabecera
  insert into public.sales(store_id, total, payment)
  values(p_store_id, coalesce(p_total,0), p_payment)
  returning id into v_sale_id;

  -- 2) Ítems + stock
  for v_item in
    select * from jsonb_array_elements(p_items)
  loop
    v_prod  := (v_item->>'product_id')::uuid;
    v_qty   := (v_item->>'qty')::numeric;
    v_price := (v_item->>'unit_price')::numeric;

    if v_prod is null or v_qty is null or v_qty <= 0 then
      raise exception 'Item inválido: %', v_item;
    end if;

    insert into public.sale_items(sale_id, product_id, qty, unit_price)
    values(v_sale_id, v_prod, v_qty, v_price);

    -- Descuento de stock
    update public.products
      set stock = coalesce(stock,0) - v_qty
    where id = v_prod;

    -- Movimiento de stock (negativo)
    insert into public.stock_movements(product_id, delta, reason, sale_id)
    values(v_prod, -v_qty, 'sale', v_sale_id);
  end loop;

  return json_build_object('sale_id', v_sale_id);
end;
$$;
