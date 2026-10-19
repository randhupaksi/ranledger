export const schema = `
CREATE TABLE IF NOT EXISTS rl_users (id text PRIMARY KEY,email text NOT NULL UNIQUE,name text NOT NULL,password_hash text NOT NULL,recovery_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rl_sessions (id text PRIMARY KEY,user_id text NOT NULL REFERENCES rl_users(id) ON DELETE CASCADE,label text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS rl_sessions_user ON rl_sessions(user_id);
CREATE TABLE IF NOT EXISTS rl_spaces (id text PRIMARY KEY,name text NOT NULL,owner_id text NOT NULL REFERENCES rl_users(id) ON DELETE CASCADE,revision bigint NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rl_members (space_id text NOT NULL REFERENCES rl_spaces(id) ON DELETE CASCADE,user_id text NOT NULL REFERENCES rl_users(id) ON DELETE CASCADE,role text NOT NULL CHECK(role IN ('owner','editor','viewer')),PRIMARY KEY(space_id,user_id));
CREATE TABLE IF NOT EXISTS rl_records (space_id text NOT NULL REFERENCES rl_spaces(id) ON DELETE CASCADE,key text NOT NULL,value jsonb,version bigint NOT NULL,PRIMARY KEY(space_id,key));
CREATE INDEX IF NOT EXISTS rl_records_cursor ON rl_records(space_id,version);
CREATE TABLE IF NOT EXISTS rl_operations (space_id text NOT NULL REFERENCES rl_spaces(id) ON DELETE CASCADE,id text NOT NULL,user_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(space_id,id));
ALTER TABLE rl_operations ADD COLUMN IF NOT EXISTS request_hash text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS rl_invites (id text PRIMARY KEY,space_id text NOT NULL REFERENCES rl_spaces(id) ON DELETE CASCADE,role text NOT NULL CHECK(role IN ('editor','viewer')),expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS rl_audit (id text PRIMARY KEY,space_id text NOT NULL REFERENCES rl_spaces(id) ON DELETE CASCADE,actor text NOT NULL,action text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS rl_audit_space ON rl_audit(space_id,created_at DESC);
CREATE TABLE IF NOT EXISTS rl_rates (key text PRIMARY KEY,hits integer NOT NULL,reset_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS rl_uploads (id text NOT NULL,user_id text NOT NULL REFERENCES rl_users(id) ON DELETE CASCADE,part integer NOT NULL,parts integer NOT NULL,target text NOT NULL,data text NOT NULL,expires_at timestamptz NOT NULL,PRIMARY KEY(id,user_id,part));
CREATE TABLE IF NOT EXISTS rl_downloads (id text PRIMARY KEY,user_id text NOT NULL REFERENCES rl_users(id) ON DELETE CASCADE,data text NOT NULL,expires_at timestamptz NOT NULL);
`;
