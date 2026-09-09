-- Join an existing household by join_code.
-- SECURITY DEFINER bypasses INSERT RLS on household_members.
-- Authorization: auth.uid() present, not already a member, code matches one household.
-- Caller cannot choose user_id or household id. Lookup is only inside this function.

create or replace function public.join_household(p_join_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  normalized text := upper(btrim(p_join_code));
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if exists (
    select 1 from public.household_members hm where hm.user_id = uid
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  if normalized is null or normalized = '' or char_length(normalized) <> 10 then
    raise exception 'invalid_join_code' using errcode = 'P0001';
  end if;

  select h.id into hid
  from public.households h
  where h.join_code = normalized;

  if hid is null then
    raise exception 'invalid_join_code' using errcode = 'P0001';
  end if;

  begin
    insert into public.household_members (household_id, user_id)
    values (hid, uid);
  exception
    when unique_violation then
      raise exception 'already_member' using errcode = 'P0001';
  end;

  return hid;
end;
$$;

revoke all on function public.join_household(text) from public, anon;
grant execute on function public.join_household(text) to authenticated;
