-- First-user household bootstrap.
-- SECURITY DEFINER bypasses INSERT RLS on households / household_members.
-- Authorization is auth.uid() plus "not already a member".
-- Caller cannot choose user_id, household id, or join_code.
-- UNIQUE(user_id) makes concurrent bootstraps fail instead of creating two households.

alter table public.household_members
  add constraint household_members_user_id_key unique (user_id);

create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
  code text;
  attempts int := 0;
  trimmed text := btrim(p_name);
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if exists (
    select 1 from public.household_members hm where hm.user_id = uid
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  if trimmed is null or trimmed = '' or char_length(trimmed) > 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  loop
    attempts := attempts + 1;
    code := upper(encode(extensions.gen_random_bytes(5), 'hex'));
    begin
      insert into public.households (name, join_code)
      values (trimmed, code)
      returning id into new_id;
      exit;
    exception
      when unique_violation then
        if attempts >= 8 then
          raise;
        end if;
    end;
  end loop;

  begin
    insert into public.household_members (household_id, user_id)
    values (new_id, uid);
  exception
    when unique_violation then
      raise exception 'already_member' using errcode = 'P0001';
  end;

  insert into public.categories (household_id, name) values
    (new_id, 'Food'),
    (new_id, 'Drinks'),
    (new_id, 'Cleaning'),
    (new_id, 'Personal Care'),
    (new_id, 'Household'),
    (new_id, 'Other');

  insert into public.locations (household_id, name, sort_order) values
    (new_id, 'Kitchen', 0),
    (new_id, 'Bathroom', 1),
    (new_id, 'Cellar', 2),
    (new_id, 'Living room', 3);

  return new_id;
end;
$$;

revoke all on function public.create_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
