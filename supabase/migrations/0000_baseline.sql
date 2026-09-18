-- Linkster baseline schema (Flutter-era tables), reconstructed in-repo so a fresh
-- Supabase project can apply the whole `supabase/migrations` chain reproducibly.
--
-- Idempotent: every statement is `IF NOT EXISTS`, so on an existing project this
-- migration is a no-op. Later migrations (0001 hardening, 0003 reader content,
-- 0004 note, 0005 RLS) evolve these tables. Run this before 0001 on a new project.
--
-- `auth.users` and `auth.uid()` are provided by Supabase's managed `auth` schema.

CREATE TABLE IF NOT EXISTS public.links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  url           text NOT NULL,
  title         text,
  description   text,
  thumbnail_url text,
  label         text,
  is_read       boolean NOT NULL DEFAULT false,
  is_archived   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.labels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_links_user_created_at ON public.links (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_labels_user ON public.labels (user_id);
