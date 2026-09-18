-- Linkster YouTube section
-- Isolates YouTube videos (`kind = 'youtube'`) into their own section, the same
-- way 0008 isolates X posts. Video metadata (title, channel, thumbnail,
-- description) already lives on `links` from the normal capture pipeline, so no
-- side table is needed. Idempotent and safe to re-run.

-- ─────────────────────────────────────────────────────────────
-- 1. links.kind — allow youtube
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.links DROP CONSTRAINT IF EXISTS links_kind_check;
ALTER TABLE public.links
  ADD CONSTRAINT links_kind_check CHECK (kind IN ('link', 'x-post', 'youtube'));

-- Backfill videos captured before this migration so they move to the section.
-- Matches youtube.com/watch?v= (incl. a trailing slash), /shorts/, /embed/,
-- /live/, /v/, youtu.be and youtube-nocookie.com URLs with an 11-character
-- video id. The id must end at a segment boundary and reserved playlist ids
-- (`videoseries`) are excluded, mirroring the TypeScript parser.
UPDATE public.links
SET kind = 'youtube'
WHERE kind = 'link'
  AND (
    url ~* '^https?://(www\.|m\.|music\.)?youtu\.be/[A-Za-z0-9_-]{11}([^A-Za-z0-9_-]|$)'
    OR url ~* '^https?://(www\.|m\.|music\.)?youtube(-nocookie)?\.com/watch/?\?[^#]*v=[A-Za-z0-9_-]{11}([^A-Za-z0-9_-]|$)'
    OR url ~* '^https?://(www\.|m\.|music\.)?youtube(-nocookie)?\.com/(shorts|embed|live|v)/[A-Za-z0-9_-]{11}([^A-Za-z0-9_-]|$)'
  )
  AND url !~* '[?&]v=videoseries'
  AND url !~* '/(shorts|embed|live|v)/videoseries';

CREATE INDEX IF NOT EXISTS idx_links_user_kind ON public.links (user_id, kind);

-- ─────────────────────────────────────────────────────────────
-- 2. link_stats — library counts stay kind='link'; expose the YouTube count
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.link_stats();

CREATE OR REPLACE FUNCTION public.link_stats()
RETURNS TABLE (
  total    bigint,
  unread   bigint,
  archived bigint,
  by_label jsonb,
  x_posts  bigint,
  youtube  bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH library AS (
    SELECT coalesce(nullif(btrim(label), ''), 'General') AS label, is_read, is_archived
    FROM public.links
    WHERE kind = 'link'
  )
  SELECT
    (SELECT count(*) FROM library),
    (SELECT count(*) FROM library WHERE is_read = false AND is_archived = false),
    (SELECT count(*) FROM library WHERE is_archived = true),
    (
      SELECT coalesce(jsonb_object_agg(label, cnt), '{}'::jsonb)
      FROM (SELECT label, count(*) AS cnt FROM library GROUP BY label) grouped
    ),
    (SELECT count(*) FROM public.links WHERE kind = 'x-post'),
    (SELECT count(*) FROM public.links WHERE kind = 'youtube')
$$;

-- Refresh the PostgREST schema cache so the recreated RPC is callable immediately.
NOTIFY pgrst, 'reload schema';
