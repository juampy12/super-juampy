-- Top de productos por período y sucursal
create or replace function public.products_top(
  p_from   timestamptz,
  p_to     timestamptz,
  p_store  uuid default null,
  p_limit  int  default 20
)
returns table(
  product_id uuid,
  sku        text,
  name       text,
  qty        numeric,
  revenue    numeric,
  tickets    bigint
)
language sql
stable
security definer
as $$
  with s as (
    select
      si.product_id,
      si.qty,
      si.unit_price,
      si.sale_id,
      sa.store_id,
      sa.created_at
    from public.sale_items si
    join public.sales sa on sa.id = si.sale_id
    where sa.created_at >= p_from
      and sa.created_at <  p_to
      and (p_store is null or sa.store_id = p_store)
  )
  select
    p.id       as product_id,
    p.sku,
    p.name,
    sum(s.qty)                           as qty,
    sum(s.qty * s.unit_price)            as revenue,
    count(distinct s.sale_id)            as tickets
  from s
  join public.products p on p.id = s.product_id
  group by p.id, p.sku, p.name
  order by qty desc, revenue desc
  limit coalesce(p_limit, 20);
$$;

-- (opcional) garantizar que el rol público pueda ejecutar el RPC
grant execute on function public.products_top(timestamptz,timestamptz,uuid,int) to anon, authenticated;
