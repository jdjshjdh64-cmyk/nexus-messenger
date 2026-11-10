export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  is_owner: boolean;
  is_admin: boolean;
  is_online: boolean;
  last_seen_at: string;
  is_banned: boolean;
  banned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chat {
  id: string;
  is_group: boolean;
  group_id: string | null;
  created_at: string;
  created_by: string;
}

export interface ChatParticipant {
  id: string;
  chat_id: string;
  user_id: string;
  joined_at: string;
  is_admin: boolean;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  message_type: 'text' | 'emoji' | 'gif' | 'image' | 'voice' | 'video' | 'gift' | 'call';
  gif_url: string | null;
  attachment_url: string | null;
  gift_id: string | null;
  call_id: string | null;
  reply_to_id: string | null;
  is_edited: boolean;
  edited_at: string | null;
  is_pinned: boolean;
  pinned_at: string | null;
  forwarded_from: string | null;
  created_at: string;
  read_at: string | null;
  reactions?: MessageReaction[];
  reply_to?: Message | null;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  avatar_url: string | null;
  description: string;
  owner_id: string;
  created_at: string;
}

export interface Contact {
  id: string;
  owner_id: string;
  contact_id: string;
  created_at: string;
}

export interface Story {
  id: string;
  user_id: string;
  content_url: string | null;
  emoji: string | null;
  caption: string;
  bg_color: string;
  created_at: string;
  expires_at: string;
}

export interface StoryView {
  id: string;
  story_id: string;
  viewer_id: string;
  viewed_at: string;
}

export interface Gift {
  id: string;
  name: string;
  emoji: string;
  description: string;
  is_nft: boolean;
  rarity: string;
  price: number;
  created_at: string;
}

export interface GiftTransaction {
  id: string;
  gift_id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  created_at: string;
}

export interface Call {
  id: string;
  caller_id: string;
  receiver_id: string;
  call_type: 'voice' | 'video';
  status: 'ringing' | 'accepted' | 'declined' | 'ended' | 'missed';
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  created_at: string;
}

export interface CallSignal {
  id: string;
  call_id: string;
  sender_id: string;
  receiver_id: string;
  signal_type: 'offer' | 'answer' | 'ice' | 'reject' | 'end';
  signal_data: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  from_user_id: string | null;
  read: boolean;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  status: 'pending' | 'reviewed' | 'resolved';
  created_at: string;
  resolved_at: string | null;
}

export interface ChatWithDetails extends Chat {
  participants: Profile[];
  last_message?: Message | null;
  group?: Group | null;
  unread_count?: number;
}
