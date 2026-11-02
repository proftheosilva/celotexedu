CREATE TABLE public.boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT boards_slug_format CHECK (
    slug ~ '^[a-z0-9][a-z0-9-]{0,15}$'
    AND slug !~ '-$'
  ),
  CONSTRAINT boards_title_length CHECK (char_length(btrim(title)) BETWEEN 3 AND 80)
);

CREATE TABLE public.board_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  author TEXT NOT NULL DEFAULT 'Visitante',
  kind TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT board_posts_kind CHECK (kind IN ('text', 'link')),
  CONSTRAINT board_posts_author_length CHECK (char_length(btrim(author)) BETWEEN 1 AND 48),
  CONSTRAINT board_posts_content_length CHECK (char_length(content) <= 900),
  CONSTRAINT board_posts_payload CHECK (
    (kind = 'text' AND url IS NULL AND char_length(btrim(content)) BETWEEN 1 AND 900)
    OR
    (kind = 'link' AND url IS NOT NULL AND char_length(content) <= 500)
  ),
  CONSTRAINT board_posts_url_protocol CHECK (url IS NULL OR url ~* '^https?://')
);

CREATE INDEX board_posts_board_created_idx
  ON public.board_posts (board_id, created_at DESC, id DESC);

ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_posts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.boards, public.board_posts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_board_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.boards
  SET updated_at = clock_timestamp()
  WHERE id = NEW.board_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_board_activity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER board_posts_touch_activity
AFTER INSERT ON public.board_posts
FOR EACH ROW
EXECUTE FUNCTION public.touch_board_activity();
