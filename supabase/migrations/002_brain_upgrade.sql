-- Brain upgrade: add unique constraint for reasoning_cache upserts
-- This enables ON CONFLICT upserts used by recomputeGradeProjection

ALTER TABLE reasoning_cache
  ADD CONSTRAINT reasoning_cache_user_type_unique
  UNIQUE (user_id, cache_type);
