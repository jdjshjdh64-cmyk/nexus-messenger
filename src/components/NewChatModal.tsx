import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Profile, ChatWithDetails, Chat } from '@/types';
import { Avatar } from '@/components/Avatar';
import { X, Search, MessageSquare } from 'lucide-react';

interface NewChatModalProps {
  onClose: () => void;
  onChatCreated: (chat: ChatWithDetails) => void;
}

export function NewChatModal({ onClose, onChatCreated }: NewChatModalProps) {
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    // Load existing contacts (users we already have chats with)
    (async () => {
      const { data: parts } = await supabase
        .from('chat_participants')
        .select('chat_id')
        .eq('user_id', profile.id);

      if (!parts || parts.length === 0) return;
      const chatIds = parts.map((p) => p.chat_id);

      const { data: chats } = await supabase
        .from('chats')
        .select('id')
        .in('id', chatIds)
        .eq('is_group', false);

      if (!chats) return;

      const otherUserIds = new Set<string>();
      for (const chat of chats) {
        const { data: cp } = await supabase
          .from('chat_participants')
          .select('user_id')
          .eq('chat_id', chat.id)
          .neq('user_id', profile.id);
        (cp || []).forEach((p) => otherUserIds.add(p.user_id));
      }

      if (otherUserIds.size > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('*')
          .in('id', [...otherUserIds]);
        setContacts((profs || []) as Profile[]);
      }
    })();
  }, [profile]);

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${search}%,display_name.ilike.%${search}%`)
        .neq('id', profile?.id || '')
        .limit(20);
      setResults((data || []) as Profile[]);
    }, 300);
    return () => clearTimeout(t);
  }, [search, profile]);

  const startChat = async (otherUser: Profile) => {
    if (!profile) return;
    setLoading(true);

    // Check if a chat already exists between these two users
    const { data: myChats } = await supabase
      .from('chat_participants')
      .select('chat_id')
      .eq('user_id', profile.id);

    if (myChats && myChats.length > 0) {
      const chatIds = myChats.map((c) => c.chat_id);
      for (const cid of chatIds) {
        const { data: participants } = await supabase
          .from('chat_participants')
          .select('user_id, chat_id')
          .eq('chat_id', cid)
          .neq('user_id', profile.id);

        if (participants && participants.length === 1 && participants[0].user_id === otherUser.id) {
          // Verify it's not a group
          const { data: chat } = await supabase
            .from('chats')
            .select('*')
            .eq('id', cid)
            .eq('is_group', false)
            .maybeSingle();

          if (chat) {
            const chatWithDetails: ChatWithDetails = {
              ...(chat as Chat),
              participants: [profile, otherUser],
            };
            setLoading(false);
            onChatCreated(chatWithDetails);
            return;
          }
        }
      }
    }

    // Create new chat
    const { data: newChat } = await supabase.from('chats').insert({
      is_group: false,
      created_by: profile.id,
    }).select('*').maybeSingle();

    if (!newChat) { setLoading(false); return; }

    await supabase.from('chat_participants').insert([
      { chat_id: (newChat as Chat).id, user_id: profile.id },
      { chat_id: (newChat as Chat).id, user_id: otherUser.id },
    ]);

    const chatWithDetails: ChatWithDetails = {
      ...(newChat as Chat),
      participants: [profile, otherUser],
    };

    setLoading(false);
    onChatCreated(chatWithDetails);
  };

  const displayList = search.trim().length >= 2 ? results : contacts;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 anim-fade-in" onClick={onClose}>
      <div className="w-full max-w-md glass-panel rounded-2xl p-6 neon-border anim-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">New Chat</h3>
          <button onClick={onClose} className="p-2 hover:bg-[#1a1a2e] rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by username or name..."
            autoFocus
            className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl pl-9 pr-3 py-3 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none"
          />
        </div>

        <div className="space-y-1 max-h-80 overflow-y-auto">
          {displayList.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              {search.trim().length >= 2 ? 'No users found' : 'Search to start a new chat'}
            </div>
          ) : (
            displayList.map((p) => (
              <button
                key={p.id}
                onClick={() => startChat(p)}
                disabled={loading}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1a1a2e] transition-colors text-left disabled:opacity-50"
              >
                <Avatar profile={p} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{p.display_name}</p>
                  <p className="text-xs text-purple-300/50 truncate">@{p.username}</p>
                </div>
                <MessageSquare className="w-5 h-5 text-purple-400" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
