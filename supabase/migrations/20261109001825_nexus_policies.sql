/*
# NEXUS Messenger - RLS Policies and Realtime

Enables RLS on all tables, grants privileges, and creates ownership/membership-based policies.
Also enables realtime on key tables.
*/

-- PROFILES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;

DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- GROUPS
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON groups TO authenticated;

DROP POLICY IF EXISTS "groups_select_member" ON groups;
CREATE POLICY "groups_select_member" ON groups FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR EXISTS (
  SELECT 1 FROM chat_participants cp
  JOIN chats c ON c.id = cp.chat_id
  WHERE c.group_id = groups.id AND cp.user_id = auth.uid()
));

DROP POLICY IF EXISTS "groups_insert_own" ON groups;
CREATE POLICY "groups_insert_own" ON groups FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "groups_update_owner" ON groups;
CREATE POLICY "groups_update_owner" ON groups FOR UPDATE TO authenticated
USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- CHATS
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON chats TO authenticated;

DROP POLICY IF EXISTS "chats_select_participant" ON chats;
CREATE POLICY "chats_select_participant" ON chats FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM chat_participants cp WHERE cp.chat_id = chats.id AND cp.user_id = auth.uid()));

DROP POLICY IF EXISTS "chats_insert_participant" ON chats;
CREATE POLICY "chats_insert_participant" ON chats FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "chats_update_participant" ON chats;
CREATE POLICY "chats_update_participant" ON chats FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM chat_participants cp WHERE cp.chat_id = chats.id AND cp.user_id = auth.uid()));

-- CHAT PARTICIPANTS
ALTER TABLE chat_participants ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON chat_participants TO authenticated;

DROP POLICY IF EXISTS "cp_select_own_or_chat" ON chat_participants;
CREATE POLICY "cp_select_own_or_chat" ON chat_participants FOR SELECT TO authenticated
USING (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM chat_participants cp2 WHERE cp2.chat_id = chat_participants.chat_id AND cp2.user_id = auth.uid()
));

DROP POLICY IF EXISTS "cp_insert_own_or_creator" ON chat_participants;
CREATE POLICY "cp_insert_own_or_creator" ON chat_participants FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM chats c WHERE c.id = chat_participants.chat_id AND c.created_by = auth.uid()
));

DROP POLICY IF EXISTS "cp_delete_own" ON chat_participants;
CREATE POLICY "cp_delete_own" ON chat_participants FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- MESSAGES
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON messages TO authenticated;

DROP POLICY IF EXISTS "messages_select_participant" ON messages;
CREATE POLICY "messages_select_participant" ON messages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM chat_participants cp WHERE cp.chat_id = messages.chat_id AND cp.user_id = auth.uid()));

DROP POLICY IF EXISTS "messages_insert_participant" ON messages;
CREATE POLICY "messages_insert_participant" ON messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND EXISTS (
  SELECT 1 FROM chat_participants cp WHERE cp.chat_id = messages.chat_id AND cp.user_id = auth.uid()
));

DROP POLICY IF EXISTS "messages_update_participant" ON messages;
CREATE POLICY "messages_update_participant" ON messages FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM chat_participants cp WHERE cp.chat_id = messages.chat_id AND cp.user_id = auth.uid()));

-- STORIES
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON stories TO authenticated;

DROP POLICY IF EXISTS "stories_select_all" ON stories;
CREATE POLICY "stories_select_all" ON stories FOR SELECT TO authenticated
USING (expires_at > now());

DROP POLICY IF EXISTS "stories_insert_own" ON stories;
CREATE POLICY "stories_insert_own" ON stories FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "stories_delete_own" ON stories;
CREATE POLICY "stories_delete_own" ON stories FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- STORY VIEWS
ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON story_views TO authenticated;

DROP POLICY IF EXISTS "sv_select_owner" ON story_views;
CREATE POLICY "sv_select_owner" ON story_views FOR SELECT TO authenticated
USING (viewer_id = auth.uid() OR EXISTS (
  SELECT 1 FROM stories s WHERE s.id = story_views.story_id AND s.user_id = auth.uid()
));

DROP POLICY IF EXISTS "sv_insert_own" ON story_views;
CREATE POLICY "sv_insert_own" ON story_views FOR INSERT TO authenticated
WITH CHECK (viewer_id = auth.uid());

-- GIFTS CATALOG
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON gifts TO authenticated;

DROP POLICY IF EXISTS "gifts_select_all" ON gifts;
CREATE POLICY "gifts_select_all" ON gifts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "gifts_insert_owner" ON gifts;
CREATE POLICY "gifts_insert_owner" ON gifts FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_owner = true));

-- GIFT TRANSACTIONS
ALTER TABLE gift_transactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON gift_transactions TO authenticated;

DROP POLICY IF EXISTS "gt_select_involved" ON gift_transactions;
CREATE POLICY "gt_select_involved" ON gift_transactions FOR SELECT TO authenticated
USING (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "gt_insert_sender" ON gift_transactions;
CREATE POLICY "gt_insert_sender" ON gift_transactions FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid());

-- CALLS
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON calls TO authenticated;

DROP POLICY IF EXISTS "calls_select_involved" ON calls;
CREATE POLICY "calls_select_involved" ON calls FOR SELECT TO authenticated
USING (caller_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "calls_insert_caller" ON calls;
CREATE POLICY "calls_insert_caller" ON calls FOR INSERT TO authenticated
WITH CHECK (caller_id = auth.uid());

DROP POLICY IF EXISTS "calls_update_involved" ON calls;
CREATE POLICY "calls_update_involved" ON calls FOR UPDATE TO authenticated
USING (caller_id = auth.uid() OR receiver_id = auth.uid());

-- CALL SIGNALING
ALTER TABLE call_signaling ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON call_signaling TO authenticated;

DROP POLICY IF EXISTS "sig_select_involved" ON call_signaling;
CREATE POLICY "sig_select_involved" ON call_signaling FOR SELECT TO authenticated
USING (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "sig_insert_involved" ON call_signaling;
CREATE POLICY "sig_insert_involved" ON call_signaling FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid());

-- NOTIFICATIONS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON notifications TO authenticated;

DROP POLICY IF EXISTS "notif_select_own" ON notifications;
CREATE POLICY "notif_select_own" ON notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_insert_any_to_user" ON notifications;
CREATE POLICY "notif_insert_any_to_user" ON notifications FOR INSERT TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "notif_update_own" ON notifications;
CREATE POLICY "notif_update_own" ON notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE call_signaling;
ALTER PUBLICATION supabase_realtime ADD TABLE stories;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_participants;
