/*
# NEXUS Messenger - Tables Only

Creates all tables without policies. Policies added in a follow-up migration.
Tables: profiles, groups, chats, chat_participants, messages, stories,
story_views, gifts, gift_transactions, calls, call_signaling, notifications.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  display_name text NOT NULL,
  avatar_url text,
  bio text DEFAULT '',
  is_owner boolean NOT NULL DEFAULT false,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  avatar_url text,
  description text DEFAULT '',
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_group boolean NOT NULL DEFAULT false,
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  emoji text NOT NULL,
  description text DEFAULT '',
  is_nft boolean NOT NULL DEFAULT false,
  rarity text DEFAULT 'common',
  price int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gift_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id uuid NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  call_type text NOT NULL DEFAULT 'voice' CHECK (call_type IN ('voice','video')),
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','accepted','declined','ended','missed')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  content text DEFAULT '',
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','emoji','gif','image','gift','call')),
  gif_url text,
  attachment_url text,
  gift_id uuid REFERENCES gift_transactions(id) ON DELETE SET NULL,
  call_id uuid REFERENCES calls(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  read_at timestamptz
);

CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  content_url text,
  emoji text,
  caption text DEFAULT '',
  bg_color text DEFAULT '#8b5cf6',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '24 hours'
);

CREATE TABLE IF NOT EXISTS story_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz DEFAULT now(),
  UNIQUE(story_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS call_signaling (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN ('offer','answer','ice','reject','end')),
  signal_data text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text DEFAULT '',
  from_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Indexes (no immutable-function predicates)
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_participants_chat ON chat_participants(chat_id);
CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_signaling_receiver ON call_signaling(receiver_id, created_at);
