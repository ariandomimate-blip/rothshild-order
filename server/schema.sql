CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 email TEXT UNIQUE NOT NULL,
 display_name TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'applicant' CHECK (role IN ('applicant','member','mentor','moderator','admin')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
 bio TEXT DEFAULT '',
 interests TEXT DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS forum_categories (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
 access_level TEXT NOT NULL DEFAULT 'member' CHECK (access_level IN ('applicant','member'))
);
CREATE TABLE IF NOT EXISTS forum_posts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), category_id UUID REFERENCES forum_categories(id),
 author_id UUID REFERENCES users(id), title TEXT NOT NULL, body TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','removed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mentor_assignments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), member_id UUID REFERENCES users(id), mentor_id UUID REFERENCES users(id),
 assigned_by UUID REFERENCES users(id), status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','accepted','declined','revoked')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(member_id, mentor_id)
);
CREATE TABLE IF NOT EXISTS conversations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), assignment_id UUID REFERENCES mentor_assignments(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conversation_members (
 conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE, user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(conversation_id,user_id)
);
CREATE TABLE IF NOT EXISTS messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
 sender_id UUID REFERENCES users(id), ciphertext TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS library_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, topic TEXT NOT NULL, summary TEXT NOT NULL, body TEXT NOT NULL,
 source_note TEXT DEFAULT '', visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','member')),
 created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO forum_categories(slug,title,access_level) VALUES
 ('welcome','Willkommen & erste Schritte','applicant'),('questions','Fragen an die Moderation','applicant'),
 ('general','Allgemeiner Austausch','member'),('history','Geschichte & Quellen','member'),
 ('philosophy','Philosophie & Ethik','member'),('symbols','Symbolik & Kunst','member'),('projects','Gemeinsame Projekte','member')
ON CONFLICT (slug) DO NOTHING;
CREATE TABLE IF NOT EXISTS security_audit_log (
 id BIGSERIAL PRIMARY KEY, actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL,
 target_user_id UUID REFERENCES users(id) ON DELETE SET NULL, details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_audit_log_created_at_idx ON security_audit_log(created_at DESC);
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_rank TEXT DEFAULT 'Kein Rang angegeben';
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_title TEXT DEFAULT 'Kein Titel angegeben';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_data TEXT;
CREATE TABLE IF NOT EXISTS profile_posts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body TEXT NOT NULL CHECK (char_length(body) <= 1800), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profile_posts_author_created_idx ON profile_posts(author_id,created_at DESC);

ALTER TABLE mentor_assignments ADD COLUMN IF NOT EXISTS member_accepted_at TIMESTAMPTZ;
ALTER TABLE mentor_assignments ADD COLUMN IF NOT EXISTS mentor_accepted_at TIMESTAMPTZ;

-- Explicitly register the requested profile as an available mentor.
-- Account approval remains unchanged and is still required by the public mentor picker.
UPDATE users SET role='mentor' WHERE lower(trim(display_name))='querox' AND role<>'admin';


-- Administrator designation explicitly requested for the unique Querox profile.
-- Promote only when exactly one matching account exists; never guess among duplicates.
DO $
DECLARE querox_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO querox_count
  FROM users
  WHERE lower(trim(display_name)) = 'querox';
  IF querox_count = 1 THEN
    UPDATE users
    SET role = 'admin', status = 'approved'
    WHERE lower(trim(display_name)) = 'querox';
    RAISE NOTICE 'Unique Querox account promoted to administrator.';
  ELSIF querox_count = 0 THEN
    RAISE NOTICE 'No Querox account found; no administrator role changed.';
  ELSE
    RAISE WARNING 'Multiple Querox accounts found (%); no administrator role changed.', querox_count;
  END IF;
END; $;

-- Per-member confirmation that the first mentor message has been reviewed.
CREATE TABLE IF NOT EXISTS conversation_unlocks (
 conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(conversation_id,user_id)
);
