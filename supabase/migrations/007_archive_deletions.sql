-- Permanent archive deletions that also hide records bundled in data.js.
-- Run this migration in the Supabase SQL editor before using the delete buttons.

create table if not exists public.archive_tombstones (
  entity_type text not null check (entity_type in ('person', 'place')),
  entity_id text not null,
  deleted_at timestamptz not null default now(),
  deleted_by uuid references public.profiles(id),
  primary key (entity_type, entity_id)
);

alter table public.archive_tombstones enable row level security;

drop policy if exists "public reads archive tombstones" on public.archive_tombstones;
create policy "public reads archive tombstones"
on public.archive_tombstones for select
using (true);

drop policy if exists "editors manage archive tombstones" on public.archive_tombstones;
create policy "editors manage archive tombstones"
on public.archive_tombstones for all to authenticated
using (public.is_editor())
with check (public.is_editor());

grant select on public.archive_tombstones to anon, authenticated;
grant insert, update, delete on public.archive_tombstones to authenticated;

create or replace function public.jsonb_remove_text_value(source jsonb, removed text)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb)
  from jsonb_array_elements_text(
    case when jsonb_typeof(source) = 'array' then source else '[]'::jsonb end
  ) as values_list(item)
  where item <> removed;
$$;

create or replace function public.delete_archive_entity(
  p_entity_type text,
  p_entity_id text,
  p_record_name text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_unit_ids text[] := '{}';
  empty_unit_ids text[] := '{}';
begin
  if not public.is_editor() then
    raise exception 'Only editors can delete archive records';
  end if;

  if p_entity_type not in ('person', 'place') then
    raise exception 'Unsupported archive entity type: %', p_entity_type;
  end if;

  if p_entity_type = 'person' then
    update public.people
    set content = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            content,
            '{parents}',
            public.jsonb_remove_text_value(content -> 'parents', p_entity_id),
            true
          ),
          '{children}',
          public.jsonb_remove_text_value(content -> 'children', p_entity_id),
          true
        ),
        '{siblings}',
        public.jsonb_remove_text_value(content -> 'siblings', p_entity_id),
        true
      ),
      '{partner}',
      case when content ->> 'partner' = p_entity_id then '""'::jsonb else coalesce(content -> 'partner', '""'::jsonb) end,
      true
    )
    where id <> p_entity_id
      and (
        coalesce(content -> 'parents', '[]'::jsonb) ? p_entity_id
        or coalesce(content -> 'children', '[]'::jsonb) ? p_entity_id
        or coalesce(content -> 'siblings', '[]'::jsonb) ? p_entity_id
        or content ->> 'partner' = p_entity_id
      );

    select coalesce(array_agg(id), '{}')
    into target_unit_ids
    from public.family_units
    where p_entity_id = any(person_ids);

    update public.family_units
    set person_ids = array_remove(person_ids, p_entity_id)
    where p_entity_id = any(person_ids);

    select coalesce(array_agg(id), '{}')
    into empty_unit_ids
    from public.family_units
    where id = any(target_unit_ids)
      and cardinality(person_ids) = 0;

    if cardinality(empty_unit_ids) > 0 then
      update public.family_units
      set child_unit_ids = array(
        select child_id
        from unnest(child_unit_ids) as child_id
        where not (child_id = any(empty_unit_ids))
      )
      where child_unit_ids && empty_unit_ids;

      delete from public.family_units where id = any(empty_unit_ids);
    end if;

    delete from public.people where id = p_entity_id;
  else
    delete from public.places where id = p_entity_id;
  end if;

  insert into public.archive_tombstones(entity_type, entity_id, deleted_by, deleted_at)
  values(p_entity_type, p_entity_id, auth.uid(), now())
  on conflict(entity_type, entity_id) do update
  set deleted_by = excluded.deleted_by,
      deleted_at = excluded.deleted_at;
end;
$$;

grant execute on function public.delete_archive_entity(text, text, text) to authenticated;
