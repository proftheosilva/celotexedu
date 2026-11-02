CREATE TABLE public.board_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  nickname_key TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  member_token_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT board_members_role CHECK (role IN ('student', 'teacher')),
  CONSTRAINT board_members_nickname_length CHECK (char_length(nickname) BETWEEN 1 AND 48),
  CONSTRAINT board_members_normalized_nickname CHECK (nickname = nickname_key AND nickname = lower(btrim(nickname))),
  CONSTRAINT board_members_token_hash_format CHECK (member_token_hash IS NULL OR member_token_hash ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX board_members_unique_nickname_idx
  ON public.board_members (board_id, nickname_key);
CREATE UNIQUE INDEX board_members_single_teacher_idx
  ON public.board_members (board_id)
  WHERE role = 'teacher';

WITH normalized AS (
  SELECT board_id,
         translate(
           lower(regexp_replace(btrim(author), '\s+', ' ', 'g')),
           'áàâãäåéèêëíìîïóòôõöúùûüçñ',
           'aaaaaaeeeeiiiiooooouuuucn'
         ) AS nickname
  FROM public.board_posts
  WHERE btrim(author) <> ''
), unique_names AS (
  SELECT DISTINCT ON (board_id, nickname) board_id, nickname
  FROM normalized
  WHERE char_length(nickname) BETWEEN 1 AND 48
  ORDER BY board_id, nickname
)
INSERT INTO public.board_members (board_id, nickname, nickname_key, role)
SELECT board_id, nickname, nickname, 'student'
FROM unique_names
ON CONFLICT (board_id, nickname_key) DO NOTHING;

ALTER TABLE public.board_posts
  ADD COLUMN member_id UUID REFERENCES public.board_members(id) ON DELETE SET NULL,
  ADD COLUMN position BIGINT;

WITH normalized AS (
  SELECT id, board_id,
         translate(
           lower(regexp_replace(btrim(author), '\s+', ' ', 'g')),
           'áàâãäåéèêëíìîïóòôõöúùûüçñ',
           'aaaaaaeeeeiiiiooooouuuucn'
         ) AS nickname
  FROM public.board_posts
), matched AS (
  SELECT normalized.id AS post_id, members.id AS member_id, members.nickname
  FROM normalized
  JOIN public.board_members AS members
    ON members.board_id = normalized.board_id
   AND members.nickname_key = normalized.nickname
)
UPDATE public.board_posts AS posts
SET author = matched.nickname,
    member_id = matched.member_id
FROM matched
WHERE posts.id = matched.post_id;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY board_id ORDER BY created_at DESC, id DESC) * 1024 AS new_position
  FROM public.board_posts
)
UPDATE public.board_posts AS posts
SET position = ranked.new_position
FROM ranked
WHERE posts.id = ranked.id;

ALTER TABLE public.board_posts ALTER COLUMN position SET NOT NULL;
CREATE INDEX board_posts_board_position_idx
  ON public.board_posts (board_id, position, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.reorder_board_posts(p_board_id UUID, p_post_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  requested_count INTEGER := COALESCE(cardinality(p_post_ids), 0);
  found_count INTEGER;
  changed_count INTEGER;
BEGIN
  IF requested_count > 60 THEN
    RAISE EXCEPTION 'At most 60 posts can be reordered at once';
  END IF;
  IF requested_count = 0 THEN
    RETURN 0;
  END IF;
  IF (SELECT count(DISTINCT ids.post_id) FROM unnest(p_post_ids) AS ids(post_id)) <> requested_count THEN
    RAISE EXCEPTION 'Post ids must be unique';
  END IF;

  SELECT count(*) INTO found_count
  FROM public.board_posts
  WHERE board_id = p_board_id AND id = ANY(p_post_ids);
  IF found_count <> requested_count THEN
    RAISE EXCEPTION 'Every post must belong to the requested board';
  END IF;

  UPDATE public.board_posts AS posts
  SET position = ordered.ordinality
  FROM unnest(p_post_ids) WITH ORDINALITY AS ordered(post_id, ordinality)
  WHERE posts.board_id = p_board_id AND posts.id = ordered.post_id;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_board_posts(UUID, UUID[]) TO anon, authenticated;

ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.board_members FROM anon, authenticated;
