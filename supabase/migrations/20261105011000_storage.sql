-- Private bucket for food photos, owner-only at every sharing tier.
-- Designed in docs/DATA_MODEL.md.

insert into storage.buckets (id, name, public) values ('food-photos', 'food-photos', false);

create policy food_photos_owner on storage.objects for all to authenticated
  using (bucket_id = 'food-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'food-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
