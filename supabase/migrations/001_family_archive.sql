-- Nilsson/Bengtsson family archive: shared data, authentication and moderation.
-- Run this migration in the Supabase SQL editor before importing current data.

create extension if not exists pgcrypto;

create type public.member_role as enum ('contributor', 'editor', 'admin');
create type public.content_visibility as enum ('public', 'family', 'private');
create type public.publication_status as enum ('draft', 'published', 'archived');
create type public.change_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.member_role not null default 'contributor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.people (
  id text primary key,
  slug text not null,
  name text not null,
  alt_name text,
  branch text not null default 'shared',
  is_direct boolean not null default false,
  is_living boolean not null default false,
  visibility public.content_visibility not null default 'public',
  publish_status public.publication_status not null default 'published',
  content jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index people_slug_key on public.people(slug);
create index people_name_idx on public.people using gin (to_tsvector('simple', name));

create table public.places (
  id text primary key,
  slug text not null,
  name text not null,
  area text,
  latitude double precision,
  longitude double precision,
  visibility public.content_visibility not null default 'public',
  publish_status public.publication_status not null default 'published',
  content jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index places_slug_key on public.places(slug);
create index places_name_idx on public.places using gin (to_tsvector('simple', name));

create table public.family_units (
  id text primary key,
  generation integer not null,
  branch text not null default 'shared',
  person_ids text[] not null default '{}',
  child_unit_ids text[] not null default '{}',
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  person_id text not null references public.people(id) on delete cascade,
  related_person_id text not null references public.people(id) on delete cascade,
  kind text not null check (kind in ('parent', 'child', 'partner', 'sibling', 'other')),
  note text,
  created_at timestamptz not null default now(),
  unique(person_id, related_person_id, kind),
  check(person_id <> related_person_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  person_id text references public.people(id) on delete cascade,
  place_id text references public.places(id) on delete set null,
  event_date text,
  event_type text,
  note text not null,
  sort_order integer not null default 0,
  visibility public.content_visibility not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(person_id is not null or place_id is not null)
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  person_id text references public.people(id) on delete cascade,
  place_id text references public.places(id) on delete cascade,
  citation text not null,
  source_url text,
  archive_reference text,
  created_at timestamptz not null default now(),
  check(person_id is not null or place_id is not null)
);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  person_id text references public.people(id) on delete cascade,
  place_id text references public.places(id) on delete cascade,
  storage_path text not null unique,
  caption text,
  photographer text,
  taken_at text,
  visibility public.content_visibility not null default 'family',
  publish_status public.publication_status not null default 'draft',
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check(person_id is not null or place_id is not null)
);

create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check(entity_type in ('person', 'place', 'event', 'source', 'media')),
  entity_id text,
  operation text not null check(operation in ('create', 'update', 'delete')),
  proposed_data jsonb not null,
  status public.change_status not null default 'pending',
  submitted_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table public.revisions (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger people_touch before update on public.people for each row execute function public.touch_updated_at();
create trigger places_touch before update on public.places for each row execute function public.touch_updated_at();
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();

create or replace function public.create_profile_for_new_user()
returns trigger security definer set search_path = public language plpgsql as $$
begin
  insert into public.profiles(id, display_name)
  values(new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict(id) do nothing;
  return new;
end;
$$;
create trigger auth_user_profile after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.is_editor()
returns boolean stable security definer set search_path = public language sql as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('editor', 'admin'));
$$;

create or replace function public.is_admin()
returns boolean stable security definer set search_path = public language sql as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.protect_profile_role()
returns trigger language plpgsql as $$
begin
  -- Requests through the public API run as authenticated and may not elevate
  -- their own role. Trusted migration/SQL Editor roles can bootstrap admins.
  if new.role is distinct from old.role
     and current_user = 'authenticated'
     and not public.is_admin() then
    raise exception 'Only an administrator can change member roles';
  end if;
  return new;
end;
$$;
create trigger profiles_protect_role before update on public.profiles
for each row execute function public.protect_profile_role();

create or replace function public.audit_archive_record()
returns trigger security definer set search_path = public language plpgsql as $$
declare archive_id text;
begin
  archive_id := case when tg_op = 'DELETE' then old.id else new.id end;
  insert into public.revisions(entity_type, entity_id, action, before_data, after_data, changed_by)
  values(
    tg_table_name,
    archive_id,
    lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger people_audit after insert or update or delete on public.people for each row execute function public.audit_archive_record();
create trigger places_audit after insert or update or delete on public.places for each row execute function public.audit_archive_record();

alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.places enable row level security;
alter table public.family_units enable row level security;
alter table public.relationships enable row level security;
alter table public.events enable row level security;
alter table public.sources enable row level security;
alter table public.media enable row level security;
alter table public.change_requests enable row level security;
alter table public.revisions enable row level security;

create policy "public reads published people" on public.people for select using (publish_status = 'published' and visibility = 'public');
create policy "members read family people" on public.people for select to authenticated using (publish_status = 'published' and visibility in ('public', 'family'));
create policy "editors manage people" on public.people for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "public reads published places" on public.places for select using (publish_status = 'published' and visibility = 'public');
create policy "members read family places" on public.places for select to authenticated using (publish_status = 'published' and visibility in ('public', 'family'));
create policy "editors manage places" on public.places for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "public reads family units" on public.family_units for select using (true);
create policy "editors manage family units" on public.family_units for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "public reads relationships" on public.relationships for select using (true);
create policy "editors manage relationships" on public.relationships for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "public reads public events" on public.events for select using (visibility = 'public');
create policy "members read family events" on public.events for select to authenticated using (visibility in ('public', 'family'));
create policy "editors manage events" on public.events for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "public reads sources" on public.sources for select using (true);
create policy "editors manage sources" on public.sources for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "public reads published media" on public.media for select using (publish_status = 'published' and visibility = 'public');
create policy "members read family media" on public.media for select to authenticated using (publish_status = 'published' and visibility in ('public', 'family'));
create policy "members add media metadata" on public.media for insert to authenticated with check (uploaded_by = auth.uid());
create policy "editors manage media" on public.media for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "members read own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_editor());
create policy "members update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "members submit changes" on public.change_requests for insert to authenticated with check (submitted_by = auth.uid() and status = 'pending');
create policy "members read own changes" on public.change_requests for select to authenticated using (submitted_by = auth.uid() or public.is_editor());
create policy "editors review changes" on public.change_requests for update to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "editors read revisions" on public.revisions for select to authenticated using (public.is_editor());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('family-media', 'family-media', false, 15728640, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict(id) do nothing;

create policy "members upload family media" on storage.objects for insert to authenticated
with check(bucket_id = 'family-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "members read family media files" on storage.objects for select to authenticated using(bucket_id = 'family-media');
create policy "owners update own media files" on storage.objects for update to authenticated
using(bucket_id = 'family-media' and owner_id = auth.uid()::text);
create policy "editors delete media files" on storage.objects for delete to authenticated
using(bucket_id = 'family-media' and public.is_editor());
