-- Canonical migration for Nils Johan Bengtsson and Master 4.
-- The American branch remains outside the primary family_units tree.
begin;

do $$
begin
  if exists(select 1 from public.people where id = 'nils_johan_bengtsson')
     and not exists(select 1 from public.people where id = 'nils_johan_bengtsson_1869') then
    insert into public.people(
      id, slug, name, alt_name, branch, is_direct, is_living, visibility,
      publish_status, content, created_by, updated_by, created_at, updated_at
    )
    select
      'nils_johan_bengtsson_1869', 'nils-johan-bengtsson-1869', name, alt_name,
      branch, is_direct, is_living, visibility, publish_status, content,
      created_by, updated_by, created_at, updated_at
    from public.people where id = 'nils_johan_bengtsson';
  end if;

  if not exists(select 1 from public.people where id = 'nils_johan_bengtsson_1869') then
    insert into public.people(id,slug,name,branch,is_direct,is_living,visibility,publish_status,content)
    values('nils_johan_bengtsson_1869','nils-johan-bengtsson-1869','Nils Johan Bengtsson','mother',false,false,'public','published','{}'::jsonb);
  end if;
end $$;

-- Copy relational references before removing the legacy row. ON CONFLICT keeps
-- the migration repeatable if part of the canonical relationship already exists.
insert into public.relationships(person_id,related_person_id,kind,note,created_at)
select
  case when person_id = 'nils_johan_bengtsson' then 'nils_johan_bengtsson_1869' else person_id end,
  case when related_person_id = 'nils_johan_bengtsson' then 'nils_johan_bengtsson_1869' else related_person_id end,
  kind,note,created_at
from public.relationships
where person_id = 'nils_johan_bengtsson' or related_person_id = 'nils_johan_bengtsson'
on conflict(person_id,related_person_id,kind) do nothing;

delete from public.relationships
where person_id = 'nils_johan_bengtsson' or related_person_id = 'nils_johan_bengtsson';

update public.events set person_id = 'nils_johan_bengtsson_1869' where person_id = 'nils_johan_bengtsson';
update public.sources set person_id = 'nils_johan_bengtsson_1869' where person_id = 'nils_johan_bengtsson';
update public.media set person_id = 'nils_johan_bengtsson_1869' where person_id = 'nils_johan_bengtsson';
update public.family_units
set person_ids = array_replace(person_ids,'nils_johan_bengtsson','nils_johan_bengtsson_1869')
where 'nils_johan_bengtsson' = any(person_ids);

-- Keep references embedded in existing JSON content in sync with the canonical ID.
update public.people
set content = replace(content::text,'"nils_johan_bengtsson"','"nils_johan_bengtsson_1869"')::jsonb
where content::text like '%"nils_johan_bengtsson"%';

delete from public.people where id = 'nils_johan_bengtsson';

update public.people
set
  slug = 'nils-johan-bengtsson',
  name = 'Nils Johan Bengtsson',
  alt_name = 'John Benson',
  branch = 'mother',
  is_direct = false,
  is_living = false,
  visibility = 'public',
  publish_status = 'published',
  content = content || jsonb_build_object(
    'name','Nils Johan Bengtsson',
    'slug','nils-johan-bengtsson',
    'aliases',jsonb_build_array('Nils Johan Bengtson','John Benson'),
    'role','Syskon till Sven Adolf · emigrant',
    'born','1869-03-26',
    'died','mellan 1940 och 1955-01-12',
    'status','confirmed',
    'place','Träslöv, Halland / Youngstown, Ohio / Chicago, Illinois',
    'parents',jsonb_build_array('bengt_a_nilsson','sara_britta_andersdotter'),
    'children','[]'::jsonb,
    'facts',jsonb_build_array(
      jsonb_build_array('Födelseort','Träslöv, Halland, Sverige'),
      jsonb_build_array('Amerikanska namnformer','Nils Johan Bengtson och John Benson'),
      jsonb_build_array('Emigration','1891 enligt Bethel-registret och amerikanska censuskällor'),
      jsonb_build_array('Vigsel','1895 i Chicago med Ida Johnson'),
      jsonb_build_array('Barn','Esther Benson Sholeen, Alice Victoria Benson Bischel och Edna Benson Weltner'),
      jsonb_build_array('Källstatus','Identiteten Nils Johan Bengtsson = John Benson är bekräftad i Master 4')
    ),
    'sources',jsonb_build_array(
      'Master 4: nils_johan_bengtsson_usa_master_2026-09-03_v4.md.',
      'Bethel Lutheran Church, Youngstown, medlemsregister.',
      'U.S. Federal Census 1900, 1920 och 1940.',
      'Cook County marriage index, Chicago 1895.',
      'Arvskifte efter Alma Josefina Bengtsson 1955.'
    ),
    'uncertainties',jsonb_build_array(
      'Exakt dödsdatum och dödsort mellan 1940 och 1955-01-12 är ännu okända.',
      'Svensk utflyttningsnotis, fartyg, resväg och ankomsthamn har ännu inte identifierats.',
      'Johns vistelseort i 1930 års census är fortfarande okänd.'
    )
  )
where id = 'nils_johan_bengtsson_1869';

commit;
