-- Full household snapshot for first hydrate and post-upload reconcile.
-- Household is derived from auth.uid() membership. No client household id.

create or replace function public.pull_household_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  member public.household_members%rowtype;
  hh public.households%rowtype;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;

  select * into member
  from public.household_members hm
  where hm.user_id = uid;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_household');
  end if;

  hid := member.household_id;

  select * into hh
  from public.households h
  where h.id = hid;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_household');
  end if;

  return jsonb_build_object(
    'ok', true,
    'household', to_jsonb(hh),
    'membership', to_jsonb(member),
    'categories', coalesce(
      (select jsonb_agg(to_jsonb(c) order by c.id) from public.categories c where c.household_id = hid),
      '[]'::jsonb
    ),
    'locations', coalesce(
      (select jsonb_agg(to_jsonb(l) order by l.id) from public.locations l where l.household_id = hid),
      '[]'::jsonb
    ),
    'products', coalesce(
      (select jsonb_agg(to_jsonb(p) order by p.id) from public.products p where p.household_id = hid),
      '[]'::jsonb
    ),
    'inventory_lots', coalesce(
      (select jsonb_agg(to_jsonb(lot) order by lot.id) from public.inventory_lots lot where lot.household_id = hid),
      '[]'::jsonb
    ),
    'inventory_operations', coalesce(
      (
        select jsonb_agg(to_jsonb(op) order by op.id)
        from public.inventory_operations op
        where op.household_id = hid
      ),
      '[]'::jsonb
    ),
    'purchased_stock', coalesce(
      (
        select jsonb_agg(to_jsonb(ps) order by ps.id)
        from public.purchased_stock ps
        where ps.household_id = hid
      ),
      '[]'::jsonb
    ),
    'shopping_items', coalesce(
      (
        select jsonb_agg(to_jsonb(si) order by si.id)
        from public.shopping_items si
        where si.household_id = hid
      ),
      '[]'::jsonb
    ),
    'server_cursor', now()
  );
end;
$$;

revoke all on function public.pull_household_state() from public, anon;
grant execute on function public.pull_household_state() to authenticated;
