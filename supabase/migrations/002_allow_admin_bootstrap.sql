-- Allow trusted SQL Editor/migration roles to assign administrators while
-- continuing to block authenticated website users from elevating themselves.
create or replace function public.protect_profile_role()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role
     and current_user = 'authenticated'
     and not public.is_admin() then
    raise exception 'Only an administrator can change member roles';
  end if;
  return new;
end;
$$;

