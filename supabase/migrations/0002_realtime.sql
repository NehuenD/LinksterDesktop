-- Linkster Realtime (Slice 10)
-- Publishes links and labels so clients receive live cross-device changes.
-- RLS is still enforced for realtime payloads.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'links'
  ) then
    alter publication supabase_realtime add table public.links;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'labels'
  ) then
    alter publication supabase_realtime add table public.labels;
  end if;
end $$;

-- Full replica identity so DELETE events carry the previous row.
alter table public.links replica identity full;
alter table public.labels replica identity full;
