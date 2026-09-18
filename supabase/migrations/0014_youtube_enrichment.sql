-- Linkster YouTube enrichment (0014)
-- Stores video metadata that the watch page exposes but the generic OG scan
-- dropped: length, channel identity and the origin shape (shorts/live/music +
-- playlist context). All columns are nullable; pre-migration rows stay valid and
-- the mapper null-safes. Idempotent; no data changes.

ALTER TABLE public.links
  ADD COLUMN IF NOT EXISTS duration_seconds int,
  ADD COLUMN IF NOT EXISTS channel_url text,
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS playlist_id text;

NOTIFY pgrst, 'reload schema';
