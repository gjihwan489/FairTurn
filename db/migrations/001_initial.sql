CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE meeting_state AS ENUM (
  'draft',
  'collecting',
  'calculating',
  'voting',
  'region_locked',
  'venue_voting',
  'confirmed',
  'completed',
  'cancelled',
  'calculation_failed',
  'expired'
);

CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  avatar_url text,
  privacy_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  accessibility_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  linked_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  local_alias text NOT NULL,
  status text NOT NULL CHECK (status IN ('invited', 'accepted', 'inactive', 'blocked')),
  sort_order integer NOT NULL DEFAULT 0,
  default_constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id, linked_user_id)
);

CREATE TABLE groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_scoring_preset text NOT NULL DEFAULT 'balanced',
  default_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_time_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  friend_id uuid REFERENCES friends(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (group_id, profile_id, friend_id),
  CHECK (profile_id IS NOT NULL OR friend_id IS NOT NULL)
);

CREATE TABLE meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id uuid REFERENCES groups(id) ON DELETE SET NULL,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  expected_ends_at timestamptz,
  activity_types text[] NOT NULL DEFAULT '{}',
  state meeting_state NOT NULL DEFAULT 'draft',
  calculation_revision integer NOT NULL DEFAULT 1,
  voting_deadline timestamptz,
  scoring_preset text NOT NULL DEFAULT 'balanced',
  scoring_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  invite_token_hash text,
  invite_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meeting_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  friend_id uuid REFERENCES friends(id) ON DELETE SET NULL,
  display_name_snapshot text NOT NULL,
  response_status text NOT NULL DEFAULT 'pending',
  attendance_status text NOT NULL DEFAULT 'unknown',
  coarse_origin_label text NOT NULL,
  private_location_ref uuid,
  constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE private_locations (
  participant_id uuid PRIMARY KEY REFERENCES meeting_participants(id) ON DELETE CASCADE,
  encrypted_origin_address bytea,
  origin_point geography(Point, 4326),
  encrypted_return_address bytea,
  return_point geography(Point, 4326),
  retention_policy jsonb NOT NULL DEFAULT '{"scope":"meeting","deleteAfterDays":30}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE meeting_participants
  ADD CONSTRAINT fk_private_location_ref
  FOREIGN KEY (private_location_ref) REFERENCES private_locations(participant_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE meeting_hubs (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  region text NOT NULL,
  representative_point geography(Point, 4326) NOT NULL,
  search_radius_meters integer NOT NULL,
  station_ids text[] NOT NULL DEFAULT '{}',
  bus_stop_ids text[] NOT NULL DEFAULT '{}',
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  hub_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE route_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES meeting_participants(id) ON DELETE CASCADE,
  hub_id text NOT NULL REFERENCES meeting_hubs(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('outbound', 'return')),
  provider text NOT NULL,
  input_hash text NOT NULL,
  metrics jsonb NOT NULL,
  raw_response_ref text,
  fetched_at timestamptz NOT NULL,
  confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  warnings text[] NOT NULL DEFAULT '{}',
  UNIQUE(meeting_id, participant_id, hub_id, direction, input_hash)
);

CREATE TABLE meeting_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  hub_id text NOT NULL REFERENCES meeting_hubs(id) ON DELETE RESTRICT,
  score_components jsonb NOT NULL,
  final_score numeric(6,3) NOT NULL,
  candidate_types text[] NOT NULL DEFAULT '{}',
  confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  warnings text[] NOT NULL DEFAULT '{}',
  explanation_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, revision, hub_id)
);

CREATE TABLE votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  participant_id uuid NOT NULL REFERENCES meeting_participants(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES meeting_candidates(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, revision, participant_id)
);

CREATE TABLE venue_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  hub_id text NOT NULL REFERENCES meeting_hubs(id) ON DELETE RESTRICT,
  external_place_id text NOT NULL,
  category text NOT NULL,
  location geography(Point, 4326),
  provider_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric(6,3) NOT NULL,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, hub_id, external_place_id)
);

CREATE TABLE burden_ledgers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  stable_participant_id text NOT NULL,
  cumulative_burden numeric(8,3) NOT NULL DEFAULT 0,
  meeting_count integer NOT NULL DEFAULT 0,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, stable_participant_id)
);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL REFERENCES burden_ledgers(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  predicted_burden numeric(8,3) NOT NULL,
  confirmed_burden numeric(8,3) NOT NULL,
  group_mean numeric(8,3) NOT NULL,
  delta numeric(8,3) NOT NULL,
  reason text NOT NULL,
  reversible_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_private_locations_origin_gix ON private_locations USING gist(origin_point);
CREATE INDEX idx_private_locations_return_gix ON private_locations USING gist(return_point);
CREATE INDEX idx_meeting_hubs_point_gix ON meeting_hubs USING gist(representative_point);
CREATE INDEX idx_route_snapshots_lookup ON route_snapshots(meeting_id, hub_id, provider, fetched_at DESC);
CREATE INDEX idx_candidates_revision ON meeting_candidates(meeting_id, revision, final_score DESC);
CREATE INDEX idx_votes_revision ON votes(meeting_id, revision);
