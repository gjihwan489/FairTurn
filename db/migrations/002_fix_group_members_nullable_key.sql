BEGIN;

ALTER TABLE group_members
  DROP CONSTRAINT IF EXISTS group_members_pkey;

ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

UPDATE group_members SET id = gen_random_uuid() WHERE id IS NULL;

ALTER TABLE group_members
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE group_members
  ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);

ALTER TABLE group_members
  DROP CONSTRAINT IF EXISTS group_members_profile_id_friend_id_check;

ALTER TABLE group_members
  DROP CONSTRAINT IF EXISTS group_members_exactly_one_member_ref;

ALTER TABLE group_members
  ADD CONSTRAINT group_members_exactly_one_member_ref
  CHECK (num_nonnulls(profile_id, friend_id) = 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_group_profile_unique
  ON group_members(group_id, profile_id)
  WHERE profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_group_friend_unique
  ON group_members(group_id, friend_id)
  WHERE friend_id IS NOT NULL;

COMMIT;
