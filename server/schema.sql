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
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 slug TEXT UNIQUE NOT NULL,
 title TEXT NOT NULL,
 access_level TEXT NOT NULL DEFAULT 'member' CHECK (access_level IN ('applicant','member'))
);
CREATE TABLE IF NOT EXISTS forum_posts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 category_id UUID REFERENCES forum_categories(id),
 author_id UUID REFERENCES users(id),
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','removed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mentor_assignments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 member_id UUID REFERENCES users(id),
 mentor_id UUID REFERENCES users(id),
 assigned_by UUID REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','accepted','declined','revoked')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(member_id, mentor_id)
);
CREATE TABLE IF NOT EXISTS conversations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 assignment_id UUID REFERENCES mentor_assignments(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conversation_members (
 conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
 user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(conversation_id,user_id)
);
CREATE TABLE IF NOT EXISTS messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
 sender_id UUID REFERENCES users(id),
 ciphertext TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS library_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 title TEXT NOT NULL,
 topic TEXT NOT NULL,
 summary TEXT NOT NULL,
 body TEXT NOT NULL,
 source_note TEXT DEFAULT '',
 visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','member')),
 created_by UUID REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO forum_categories(slug,title,access_level) VALUES
 ('welcome','Willkommen & erste Schritte','applicant'),
 ('questions','Fragen an die Moderation','applicant'),
 ('general','Allgemeiner Austausch','member'),
 ('history','Geschichte & Quellen','member'),
 ('philosophy','Philosophie & Ethik','member'),
 ('symbols','Symbolik & Kunst','member'),
 ('projects','Gemeinsame Projekte','member')
ON CONFLICT (slug) DO NOTHING;
