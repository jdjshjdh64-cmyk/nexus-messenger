import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Profile, ChatWithDetails, Message } from '@/types';
import { Avatar } from '@/components/Avatar';
import { Search, MessageSquarePlus, Users, Gift as GiftIcon, User, Settings, Bell, X, Zap, Shield } from 'lucide-react';

interface SidebarProps {
  activeView: 'chats' | 'contacts' | 'gifts' | 'profile' | 'settings' | 'admin' | 'groups' | 'stories' | 'calls';
  setActiveView: (view: 'chats' | 'contacts' | 'gifts' | 'profile' | 'settings' | 'admin' | 'groups' | 'stories' | 'calls') => void;
  activeChatId: string | null;
  onSelectChat: (chat: ChatWithDetails) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
  onOpenProfile: (profile: Profile) => void;
  notifCount: number;
}

export function Sidebar({
  activeView, setActiveView, activeChatId, onSelectChat, onNewChat, onNewGroup, onOpenProfile, notifCount,
}: SidebarProps) {
  const { profile } = useAuth();
  const [chats, setChats] = useState<ChatWithDetails[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);

  const loadChats = useCallback(async () => {
    if (!profile) return;

    const { data: participants } = await supabase
      .from('chat_participants')
      .select('chat_id')
      .eq('user_id', profile.id);

    if (!participants || participants.length === 0) {
      setChats([]);
      return;
    }

    const chatIds = participants.map((p) => p.chat_id);

    const { data: chatRows } = await supabase
      .from('chats')
      .select('*')
      .in('id', chatIds)
      .order('created_at', { ascending: false });

    if (!chatRows) return;

    const enriched: ChatWithDetails[] = [];
    for (const chat of chatRows) {
      const { data: chatParticipants } = await supabase
        .from('chat_participants')
        .select('user_id')
        .eq('chat_id', chat.id);

      const participantIds = (chatParticipants || []).map((p) => p.user_id).filter((id) => id !== profile.id);

      const { data: participantProfiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', chat.is_group ? (chatParticipants || []).map((p) => p.user_id) : participantIds);

      let group = null;
      if (chat.is_group && chat.group_id) {
        const { data: g } = await supabase
          .from('groups')
          .select('*')
          .eq('id', chat.group_id)
          .maybeSingle();
        group = g;
      }

      const { data: lastMsg } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { count: unreadCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('chat_id', chat.id)
        .is('read_at', null)
        .neq('sender_id', profile.id);

      enriched.push({
        ...chat,
        participants: (participantProfiles || []) as Profile[],
        last_message: (lastMsg as Message) || null,
        group: group,
        unread_count: unreadCount || 0,
      });
    }

    enriched.sort((a, b) => {
      const aTime = a.last_message?.created_at || a.created_at;
      const bTime = b.last_message?.created_at || b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    setChats(enriched);
  }, [profile]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // Realtime updates
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('chat_list_updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => loadChats())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_participants' }, () => loadChats())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => loadChats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, loadChats]);

  // Search
  useEffect(() => {
    if (search.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${search}%,display_name.ilike.%${search}%`)
        .neq('id', profile?.id || '')
        .limit(10);
      setSearchResults((data || []) as Profile[]);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, profile]);

  const navItems = [
    { key: 'chats' as const, icon: MessageSquarePlus, label: 'Chats' },
    { key: 'contacts' as const, icon: Users, label: 'Contacts' },
    { key: 'gifts' as const, icon: GiftIcon, label: 'Gifts' },
    { key: 'profile' as const, icon: User, label: 'Profile' },
  ];

  // Profile view content
  if (activeView === 'profile') {
    return (
      <div className="w-full sm:w-80 md:w-96 h-full flex flex-col bg-[#0d0d18] border-r border-[#1a1a2e] safe-top">
        {/* Header */}
        <div className="p-4 border-b border-[#1a1a2e]">
          <h2 className="text-xl font-bold neon-text">Profile</h2>
        </div>

        {/* Profile card */}
        <div className="flex-1 overflow-y-auto p-4">
          <button
            onClick={() => profile && onOpenProfile(profile)}
            className="w-full flex items-center gap-4 bg-[#131320] rounded-2xl p-4 border border-[#1a1a2e] hover:border-purple-500/30 transition-all"
          >
            <Avatar profile={profile} size="xl" ring online={profile?.is_online} />
            <div className="flex-1 min-w-0 text-left">
              <h3 className="text-lg font-bold text-white truncate">{profile?.display_name}</h3>
              <p className="text-purple-300/60 text-sm">@{profile?.username}</p>
              {profile?.is_owner && (
                <span className="inline-flex items-center gap-1 mt-1 text-xs text-yellow-400 font-medium">
                  <Shield className="w-3 h-3" /> Owner & Admin
                </span>
              )}
            </div>
          </button>

          {/* Menu items */}
          <div className="space-y-1 mt-4">
            <button
              onClick={() => setActiveView('settings')}
              className="w-full flex items-center gap-3 p-3 rounded-xl transition-colors hover:bg-[#1a1a2e]"
            >
              <Settings className="w-5 h-5 text-purple-300" />
              <span className="text-sm text-white font-medium">Settings</span>
            </button>
            <button
              onClick={() => setActiveView('groups')}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1a1a2e] transition-colors"
            >
              <Users className="w-5 h-5 text-purple-300" />
              <span className="text-sm text-white font-medium">Groups</span>
            </button>
            <button
              onClick={() => setActiveView('calls')}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1a1a2e] transition-colors"
            >
              <MessageSquarePlus className="w-5 h-5 text-purple-300" />
              <span className="text-sm text-white font-medium">Calls</span>
            </button>
            <button
              onClick={() => setActiveView('stories')}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1a1a2e] transition-colors"
            >
              <Bell className="w-5 h-5 text-purple-300" />
              <span className="text-sm text-white font-medium">Stories</span>
            </button>
            {profile?.is_owner && (
              <button
                onClick={() => setActiveView('admin')}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1a1a2e] transition-colors"
              >
                <Shield className="w-5 h-5 text-yellow-400" />
                <span className="text-sm text-white font-medium">Admin Panel</span>
              </button>
            )}
          </div>
        </div>

        {/* Bottom nav */}
        <BottomNav navItems={navItems} activeView={activeView} setActiveView={setActiveView} />
      </div>
    );
  }

  return (
    <div className="w-full sm:w-80 md:w-96 h-full flex flex-col bg-[#0d0d18] border-r border-[#1a1a2e] safe-top">
      {/* Header */}
      <div className="p-4 border-b border-[#1a1a2e]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-purple flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-xl font-bold neon-text">NEXUS</span>
          </div>
          <div className="flex items-center gap-1">
            {notifCount > 0 && (
              <button
                onClick={() => setActiveView('stories')}
                className="relative p-2 rounded-lg hover:bg-[#1a1a2e] transition-colors"
              >
                <Bell className="w-5 h-5 text-purple-300" />
                <span className="absolute top-1 right-1 w-4 h-4 bg-purple-500 rounded-full text-[10px] flex items-center justify-center text-white font-bold">
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              </button>
            )}
            <button
              onClick={() => profile && onOpenProfile(profile!)}
              className="p-2 rounded-lg hover:bg-[#1a1a2e] transition-colors"
            >
              <Avatar profile={profile} size="xs" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="mt-2 space-y-1 anim-fade-in">
            {searchResults.map((p) => (
              <button
                key={p.id}
                onClick={() => { onOpenProfile(p); setSearch(''); }}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[#1a1a2e] transition-colors text-left"
              >
                <Avatar profile={p} size="sm" online={p.is_online} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{p.display_name}</p>
                  <p className="text-xs text-purple-300/50 truncate">@{p.username}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <MessageSquarePlus className="w-12 h-12 text-purple-500/30 mb-3" />
            <p className="text-gray-500 text-sm">No chats yet</p>
            <p className="text-gray-600 text-xs mt-1">Search for users to start chatting</p>
          </div>
        ) : (
          <div className="space-y-0.5 p-2">
            {chats.map((chat) => {
              const otherUser = chat.participants.find((p) => p.id !== profile?.id);
              const displayName = chat.is_group ? (chat.group?.name || 'Group') : otherUser?.display_name;
              const displayAvatar = chat.is_group ? null : otherUser;

              return (
                <button
                  key={chat.id}
                  onClick={() => onSelectChat(chat)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                    activeChatId === chat.id ? 'bg-purple-500/15 neon-border' : 'hover:bg-[#1a1a2e]'
                  }`}
                >
                  {chat.is_group ? (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center shrink-0">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                  ) : (
                    <Avatar profile={displayAvatar} size="md" online={otherUser?.is_online} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                      {chat.last_message && (
                        <span className="text-xs text-gray-600 shrink-0 ml-2">
                          {formatTime(chat.last_message.created_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500 truncate">
                        {chat.last_message ? (
                          chat.last_message.message_type === 'gif' ? 'GIF' :
                          chat.last_message.message_type === 'emoji' ? chat.last_message.content :
                          chat.last_message.message_type === 'gift' ? 'Gift' :
                          chat.last_message.message_type === 'call' ? 'Call' :
                          chat.last_message.message_type === 'image' ? 'Photo' :
                          chat.last_message.message_type === 'voice' ? 'Voice' :
                          chat.last_message.message_type === 'video' ? 'Video' :
                          chat.last_message.content
                        ) : chat.is_group ? `${chat.participants.length} members` : 'Say hi!'}
                      </p>
                      {chat.unread_count && chat.unread_count > 0 ? (
                        <span className="bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                          {chat.unread_count > 9 ? '9+' : chat.unread_count}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="border-t border-[#1a1a2e] p-2 safe-bottom">
        <div className="flex justify-around mb-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveView(item.key)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all relative ${
                activeView === item.key ? 'gradient-purple text-white neon-purple' : 'text-gray-500 hover:text-purple-300 hover:bg-[#1a1a2e]'
              }`}
              title={item.label}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 gradient-purple text-white py-2.5 rounded-xl text-sm font-semibold neon-purple hover:neon-purple-strong transition-all mb-1"
        >
          <MessageSquarePlus className="w-4 h-4" />
          New Chat
        </button>
        <button
          onClick={onNewGroup}
          className="w-full flex items-center justify-center gap-2 bg-[#1a1a2e] text-purple-300 py-2 rounded-xl text-xs font-medium hover:bg-[#2a2a3e] transition-all"
        >
          <Users className="w-4 h-4" />
          New Group
        </button>
      </div>
    </div>
  );
}

function BottomNav({
  navItems,
  activeView,
  setActiveView,
}: {
  navItems: { key: string; icon: typeof Zap; label: string }[];
  activeView: string;
  setActiveView: (view: any) => void;
}) {
  return (
    <div className="border-t border-[#1a1a2e] p-2 safe-bottom">
      <div className="flex justify-around">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => setActiveView(item.key)}
            className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all ${
              activeView === item.key ? 'gradient-purple text-white neon-purple' : 'text-gray-500 hover:text-purple-300 hover:bg-[#1a1a2e]'
            }`}
            title={item.label}
          >
            <item.icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
