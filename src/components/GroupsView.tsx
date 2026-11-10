import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Profile, Group, ChatWithDetails, Chat } from '@/types';
import { Avatar } from '@/components/Avatar';
import { Users, Plus, X, Crown, MessageSquare } from 'lucide-react';

interface GroupsViewProps {
  onOpenChat: (chat: ChatWithDetails) => void;
  onNewGroup: () => void;
}

export function GroupsView({ onOpenChat, onNewGroup }: GroupsViewProps) {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<(Group & { member_count: number; chat_id: string })[]>([]);

  const loadGroups = useCallback(async () => {
    if (!profile) return;

    const { data: participants } = await supabase
      .from('chat_participants')
      .select('chat_id')
      .eq('user_id', profile.id);

    if (!participants || participants.length === 0) return;

    const chatIds = participants.map((p) => p.chat_id);
    const { data: chats } = await supabase
      .from('chats')
      .select('*')
      .in('id', chatIds)
      .eq('is_group', true);

    if (!chats || chats.length === 0) return;

    const enriched: (Group & { member_count: number; chat_id: string })[] = [];
    for (const chat of chats as Chat[]) {
      if (!chat.group_id) continue;
      const { data: group } = await supabase
        .from('groups')
        .select('*')
        .eq('id', chat.group_id)
        .maybeSingle();
      if (group) {
        const { count } = await supabase
          .from('chat_participants')
          .select('*', { count: 'exact', head: true })
          .eq('chat_id', chat.id);
        enriched.push({ ...(group as Group), member_count: count || 0, chat_id: chat.id });
      }
    }

    setGroups(enriched);
  }, [profile]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const openGroupChat = (group: Group & { member_count: number; chat_id: string }) => {
    const chat: ChatWithDetails = {
      id: group.chat_id,
      is_group: true,
      group_id: group.id,
      created_at: group.created_at,
      created_by: group.owner_id,
      participants: [],
      group: group,
    };
    onOpenChat(chat);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0f] p-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Users className="w-7 h-7 text-purple-400" />
          <h2 className="text-2xl font-bold neon-text">Groups</h2>
        </div>
        <button onClick={onNewGroup}
          className="flex items-center gap-2 gradient-purple text-white px-4 py-2 rounded-xl text-sm font-semibold neon-purple hover:neon-purple-strong transition-all">
          <Plus className="w-4 h-4" />
          New Group
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-[#131320] flex items-center justify-center mb-4 border border-[#2a2a3e]">
            <Users className="w-10 h-10 text-purple-500/40" />
          </div>
          <p className="text-gray-400 text-sm">No groups yet</p>
          <p className="text-gray-600 text-xs mt-1 mb-4">Create a group to chat with multiple people</p>
          <button onClick={onNewGroup}
            className="gradient-purple text-white px-6 py-2.5 rounded-xl text-sm font-semibold neon-purple">
            Create Group
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {groups.map((group) => {
            const isOwner = group.owner_id === profile?.id;
            return (
              <button key={group.id} onClick={() => openGroupChat(group)}
                className="bg-[#131320] hover:bg-[#1a1a2e] rounded-2xl p-4 border border-[#1a1a2e] hover:border-purple-500/30 transition-all text-left">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center shrink-0">
                    <Users className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-white truncate">{group.name}</p>
                      {isOwner && <Crown className="w-3.5 h-3.5 text-yellow-400 shrink-0" />}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{group.description || 'No description'}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-purple-300/60">{group.member_count} members</span>
                      <span className="text-xs text-gray-600 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" /> Open
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface NewGroupModalProps {
  onClose: () => void;
  onCreated: (chat: ChatWithDetails) => void;
}

export function NewGroupModal({ onClose, onCreated }: NewGroupModalProps) {
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('chat_participants')
      .select('chat_id')
      .eq('user_id', profile.id)
      .then(async ({ data: parts }) => {
        if (!parts) return;
        const chatIds = parts.map((p) => p.chat_id);
        const { data: chats } = await supabase
          .from('chats')
          .select('*')
          .in('id', chatIds)
          .eq('is_group', false);
        if (!chats) return;

        const otherUserIds = new Set<string>();
        for (const chat of chats as Chat[]) {
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
      });
  }, [profile]);

  useEffect(() => {
    if (search.trim().length < 2) return;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${search}%,display_name.ilike.%${search}%`)
        .neq('id', profile?.id || '')
        .limit(10);
      setContacts((data || []) as Profile[]);
    }, 300);
    return () => clearTimeout(t);
  }, [search, profile]);

  const toggleSelect = (p: Profile) => {
    setSelected((prev) => {
      if (prev.find((x) => x.id === p.id)) return prev.filter((x) => x.id !== p.id);
      return [...prev, p];
    });
  };

  const createGroup = async () => {
    if (!profile || !name.trim() || selected.length === 0) return;
    setCreating(true);

    const { data: group } = await supabase.from('groups').insert({
      name: name.trim(),
      description: description.trim(),
      owner_id: profile.id,
    }).select('*').maybeSingle();

    if (!group) { setCreating(false); return; }

    const { data: chat } = await supabase.from('chats').insert({
      is_group: true,
      group_id: (group as Group).id,
      created_by: profile.id,
    }).select('*').maybeSingle();

    if (!chat) { setCreating(false); return; }

    const allMembers = [profile, ...selected];
    for (const member of allMembers) {
      await supabase.from('chat_participants').insert({
        chat_id: (chat as Chat).id,
        user_id: member.id,
      });
      if (member.id !== profile.id) {
        await supabase.from('notifications').insert({
          user_id: member.id,
          type: 'group',
          title: profile.display_name,
          body: `Added you to group "${name.trim()}"`,
          from_user_id: profile.id,
        });
      }
    }

    const chatWithDetails: ChatWithDetails = {
      ...(chat as Chat),
      participants: allMembers,
      group: group as Group,
    };

    setCreating(false);
    onCreated(chatWithDetails);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 anim-fade-in" onClick={onClose}>
      <div className="w-full max-w-md glass-panel rounded-2xl p-6 neon-border anim-scale-in max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Create Group</h3>
          <button onClick={onClose} className="p-2 hover:bg-[#1a1a2e] rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Group name"
          className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none mb-3" />

        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none mb-4" />

        {selected.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
            {selected.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 bg-purple-500/20 rounded-full pl-1 pr-2 py-1 shrink-0">
                <Avatar profile={p} size="xs" />
                <span className="text-xs text-white">{p.display_name.split(' ')[0]}</span>
                <button onClick={() => toggleSelect(p)} className="p-0.5 hover:bg-purple-500/30 rounded-full">
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users to add..."
          className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none mb-3" />

        <div className="space-y-1 max-h-48 overflow-y-auto">
          {contacts.map((p) => {
            const isSelected = !!selected.find((x) => x.id === p.id);
            return (
              <button key={p.id} onClick={() => toggleSelect(p)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition-colors ${isSelected ? 'bg-purple-500/20' : 'hover:bg-[#1a1a2e]'}`}>
                <Avatar profile={p} size="sm" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-white">{p.display_name}</p>
                  <p className="text-xs text-purple-300/50">@{p.username}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 transition-all ${isSelected ? 'gradient-purple border-purple-400' : 'border-[#2a2a3e]'}`}>
                  {isSelected && <div className="w-full h-full rounded-full flex items-center justify-center"><span className="text-white text-[10px]">✓</span></div>}
                </div>
              </button>
            );
          })}
        </div>

        <button onClick={createGroup} disabled={!name.trim() || selected.length === 0 || creating}
          className="w-full gradient-purple text-white font-semibold py-3 rounded-xl neon-purple hover:neon-purple-strong transition-all disabled:opacity-50 mt-4">
          {creating ? 'Creating...' : `Create Group (${selected.length} members)`}
        </button>
      </div>
    </div>
  );
}
