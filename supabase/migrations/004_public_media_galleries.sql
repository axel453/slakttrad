-- Public gallery images are kept separate from the private family-media bucket.
-- Only editors and administrators may upload, update or remove these files.

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values(
  'family-public-media',
  'family-public-media',
  true,
  15728640,
  array['image/jpeg','image/png','image/webp']
)
on conflict(id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "editors upload public gallery media"
on storage.objects for insert to authenticated
with check(
  bucket_id = 'family-public-media'
  and public.is_editor()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "editors update public gallery media"
on storage.objects for update to authenticated
using(bucket_id = 'family-public-media' and public.is_editor())
with check(bucket_id = 'family-public-media' and public.is_editor());

create policy "editors delete public gallery media"
on storage.objects for delete to authenticated
using(bucket_id = 'family-public-media' and public.is_editor());
