ALTER TABLE public.board_posts
  ADD COLUMN owner_token_hash TEXT,
  ADD CONSTRAINT board_posts_owner_token_hash_format
    CHECK (owner_token_hash IS NULL OR owner_token_hash ~ '^[a-f0-9]{64}$');

CREATE INDEX board_posts_owner_token_idx
  ON public.board_posts (id, board_id, owner_token_hash)
  WHERE owner_token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_board_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.boards
  SET updated_at = clock_timestamp()
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.board_id ELSE NEW.board_id END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS board_posts_touch_activity ON public.board_posts;
CREATE TRIGGER board_posts_touch_activity
AFTER INSERT OR DELETE ON public.board_posts
FOR EACH ROW
EXECUTE FUNCTION public.touch_board_activity();
