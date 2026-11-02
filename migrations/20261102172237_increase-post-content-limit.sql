ALTER TABLE public.board_posts
  DROP CONSTRAINT board_posts_content_length,
  DROP CONSTRAINT board_posts_payload;

ALTER TABLE public.board_posts
  ADD CONSTRAINT board_posts_content_length
    CHECK (char_length(content) <= 20000),
  ADD CONSTRAINT board_posts_payload CHECK (
    (kind = 'text' AND url IS NULL AND char_length(btrim(content)) BETWEEN 1 AND 20000)
    OR
    (kind = 'link' AND url IS NOT NULL AND char_length(content) <= 500)
  );
