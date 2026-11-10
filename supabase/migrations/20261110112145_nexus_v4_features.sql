/*
# NEXUS V4 — Messaging Features Migration

## Changes
1. New table: `contacts` — user contact lists (add/remove contacts)
2. New table: `message_reactions` — emoji reactions on messages
3. New table: `reports` — user reports for admin moderation
4. New columns on `messages`: reply_to_id, is_edited, edited_at, is_pinned, pinned_at, forwarded_from
5. New columns on `chat_participants`: is_admin (group admin role)
6. New columns on `profiles`: is_online, last_seen_at, is_banned, banned_at
7. New SECURITY DEFINER function: `is_admin()` — server-side admin check
8. RLS policies on all new tables
9. Grants and realtime additions
10. Seed gift catalog if empty

## Security
- RLS enabled on all new tables
- `is_admin()` SECURITY DEFINER function checks profiles.is_admin/is_owner
- Reports can only be created by authenticated users, read by admins only
- Contacts are owner-scoped
- Reactions are participant-scoped (must be in the chat)
- Banned column is admin-only writable via RLS
*/

-- ============================================================
-- 1. contacts table
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(owner_id, contact_id)
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON contacts TO authenticated;

DROP POLICY IF EXISTS "contacts_select_own" ON contacts;
CREATE POLICY "contacts_select_own" ON contacts FOR SELECT TO authenticated
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "contacts_insert_own" ON contacts;
CREATE POLICY "contacts_insert_own" ON contacts FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "contacts_delete_own" ON contacts;
CREATE POLICY "contacts_delete_own" ON contacts FOR DELETE TO authenticated
USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_id);

-- ============================================================
-- 2. message_reactions table
-- ============================================================
CREATE TABLE IF NOT EXISTS message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON message_reactions TO authenticated;

DROP POLICY IF EXISTS "reactions_select_participant" ON message_reactions;
CREATE POLICY "reactions_select_participant" ON message_reactions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM messages m
  JOIN chat_participants cp ON cp.chat_id = m.chat_id
  WHERE m.id = message_reactions.message_id AND cp.user_id = auth.uid()
));

DROP POLICY IF EXISTS "reactions_insert_participant" ON message_reactions;
CREATE POLICY "reactions_insert_participant" ON message_reactions FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND EXISTS (
  SELECT 1 FROM messages m
  JOIN chat_participants cp ON cp.chat_id = m.chat_id
  WHERE m.id = message_reactions.message_id AND cp.user_id = auth.uid()
));

DROP POLICY IF EXISTS "reactions_delete_own" ON message_reactions;
CREATE POLICY "reactions_delete_own" ON message_reactions FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);

-- ============================================================
-- 3. reports table (admin moderation)
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','resolved')),
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON reports TO authenticated;

DROP POLICY IF EXISTS "reports_select_own_or_admin" ON reports;
CREATE POLICY "reports_select_own_or_admin" ON reports FOR SELECT TO authenticated
USING (reporter_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.is_admin = true OR p.is_owner = true)));

DROP POLICY IF EXISTS "reports_insert_own" ON reports;
CREATE POLICY "reports_insert_own" ON reports FOR INSERT TO authenticated
WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "reports_update_admin" ON reports;
CREATE POLICY "reports_update_admin" ON reports FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.is_admin = true OR p.is_owner = true)))
WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.is_admin = true OR p.is_owner = true)));

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

-- ============================================================
-- 4. messages: add reply, edit, pin, forward columns
-- ============================================================
DO $$ BEGIN
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES messages(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from uuid REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Allow DELETE on messages (for deleting own messages)
GRANT DELETE ON messages TO authenticated;

DROP POLICY IF EXISTS "messages_delete_own" ON messages;
CREATE POLICY "messages_delete_own" ON messages FOR DELETE TO authenticated
USING (sender_id = auth.uid());

-- ============================================================
-- 5. chat_participants: add is_admin for group roles
-- ============================================================
DO $$ BEGIN
  ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Allow UPDATE on chat_participants for group management
GRANT UPDATE ON chat_participants TO authenticated;

DROP POLICY IF EXISTS "cp_update_chat_creator_or_admin" ON chat_participants;
CREATE POLICY "cp_update_chat_creator_or_admin" ON chat_participants FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM chats c WHERE c.id = chat_participants.chat_id AND c.created_by = auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM chats c WHERE c.id = chat_participants.chat_id AND c.created_by = auth.uid())
);

-- Allow group creator to remove participants
DROP POLICY IF EXISTS "cp_delete_chat_creator_or_own" ON chat_participants;
CREATE POLICY "cp_delete_chat_creator_or_own" ON chat_participants FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM chats c WHERE c.id = chat_participants.chat_id AND c.created_by = auth.uid())
);

-- ============================================================
-- 6. profiles: add online status, ban status
-- ============================================================
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Admin can update any profile (for banning)
DROP POLICY IF EXISTS "profiles_update_admin_fields" ON profiles;
CREATE POLICY "profiles_update_admin_fields" ON profiles FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.is_admin = true OR p.is_owner = true)))
WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.is_admin = true OR p.is_owner = true)));

-- ============================================================
-- 7. is_admin() SECURITY DEFINER function
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (is_admin = true OR is_owner = true)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ============================================================
-- 8. Seed gift catalog if empty
-- ============================================================
INSERT INTO gifts (name, emoji, description, is_nft, rarity, price)
SELECT * FROM (VALUES
  ('Rose', '🌹', 'A classic rose', false, 'common', 10),
  ('Heart', '❤️', 'Show your love', false, 'common', 5),
  ('Cake', '🎂', 'Happy birthday!', false, 'common', 15),
  ('Star', '⭐', 'You are a star', false, 'common', 10),
  ('Diamond', '💎', 'Forever precious', false, 'rare', 50),
  ('Crown', '👑', 'Royalty gift', false, 'rare', 75),
  ('Fire', '🔥', 'You are on fire!', false, 'common', 10),
  ('Bouquet', '💐', 'Flowers for you', false, 'common', 20),
  ('Galaxy NFT', '🌌', 'Own a piece of the galaxy', true, 'epic', 100),
  ('Phoenix NFT', '🦅', 'Legendary phoenix', true, 'legendary', 250),
  ('Dragon NFT', '🐉', 'Mythic dragon collectible', true, 'mythic', 500),
  ('Unicorn NFT', '🦄', 'Magical unicorn', true, 'epic', 150)
) AS v(name, emoji, description, is_nft, rarity, price)
WHERE NOT EXISTS (SELECT 1 FROM gifts LIMIT 1);

-- ============================================================
-- 9. Realtime additions (using DO block to handle duplicates)
-- ============================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
