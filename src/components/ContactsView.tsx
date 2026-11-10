import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Profile, Contact } from '@/types';
import { Avatar } from '@/components/Avatar';
import { Search, UserPlus, Trash2, MessageSquare, X, Users } from 'lucide-react';

interface ContactsViewProps {
  onOpenProfile: (profile: Profile) => void;
  onMessage: (profile: Profile) => void;
}

export function ContactsView({ onOpenProfile, onMessage }: ContactsViewProps) {
  const { profile } = useAuth();
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [contactIds, setContactIds] = useState<Set<string>>(new Set());

  const loadContacts = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    const { data: contactRows } = await supabase
      .from('contacts')
      .select('contact_id')
      .eq('owner_id', profile.id);

    const ids = new Set((contactRows || []).map((c) => c.contact_id));
    setContactIds(ids);

    if (ids.size === 0) {
      setContacts([]);
      setLoading(false);
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', [...ids])
      .order('display_name', { ascending: true });

    setContacts((profiles || []) as Profile[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    if (search.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${search}%,display_name.ilike.%${search}%`)
        .neq('id', profile?.id || '')
        .limit(20);
      setSearchResults((data || []) as Profile[]);
    }, 300);
    return () => clearTimeout(t);
  }, [search, profile]);

  const addContact = async (contactId: string) => {
    if (!profile) return;
    await supabase.from('contacts').insert({
      owner_id: profile.id,
      contact_id: contactId,
    });
    setShowAddModal(false);
    setSearch('');
    setSearchResults([]);
    loadContacts();
  };

  const removeContact = async (contactId: string) => {
    if (!profile) return;
    await supabase.from('contacts')
      .delete()
      .eq('owner_id', profile.id)
      .eq('contact_id', contactId);
    loadContacts();
  };

  const isContact = (id: string) => contactIds.has(id);

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0f] p-4 safe-bottom">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Users className="w-7 h-7 text-purple-400" />
          <h2 className="text-2xl font-bold neon-text">Contacts</h2>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 gradient-purple text-white px-4 py-2 rounded-xl text-sm font-semibold neon-purple hover:neon-purple-strong transition-all"
        >
          <UserPlus className="w-4 h-4" />
          Add
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-[#131320] flex items-center justify-center mb-4 border border-[#2a2a3e]">
            <Users className="w-10 h-10 text-purple-500/40" />
          </div>
          <p className="text-gray-400 text-sm">No contacts yet</p>
          <p className="text-gray-600 text-xs mt-1 mb-4">Search for users to add them</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="gradient-purple text-white px-6 py-2.5 rounded-xl text-sm font-semibold neon-purple"
          >
            Add Contact
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 bg-[#131320] rounded-xl p-3 border border-[#1a1a2e] hover:border-purple-500/20 transition-all"
            >
              <button onClick={() => onOpenProfile(c)}>
                <Avatar profile={c} size="md" online={c.is_online} />
              </button>
              <div className="flex-1 min-w-0">
                <button onClick={() => onOpenProfile(c)} className="text-left">
                  <p className="text-sm font-semibold text-white truncate">{c.display_name}</p>
                  <p className="text-xs text-purple-300/50 truncate">@{c.username}</p>
                </button>
              </div>
              <button
                onClick={() => onMessage(c)}
                className="p-2.5 rounded-xl bg-[#1a1a2e] hover:gradient-purple transition-all group"
                title="Message"
              >
                <MessageSquare className="w-5 h-5 text-purple-300 group-hover:text-white" />
              </button>
              <button
                onClick={() => removeContact(c.id)}
                className="p-2.5 rounded-xl bg-[#1a1a2e] hover:bg-red-500/20 transition-all group"
                title="Remove"
              >
                <Trash2 className="w-5 h-5 text-gray-400 group-hover:text-red-400" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 anim-fade-in"
          onClick={() => { setShowAddModal(false); setSearch(''); setSearchResults([]); }}
        >
          <div
            className="w-full max-w-md glass-panel rounded-2xl p-6 neon-border anim-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Add Contact</h3>
              <button
                onClick={() => { setShowAddModal(false); setSearch(''); setSearchResults([]); }}
                className="p-2 hover:bg-[#1a1a2e] rounded-lg"
              >
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
              {searchResults.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  {search.trim().length >= 2 ? 'No users found' : 'Search to find users'}
                </div>
              ) : (
                searchResults.map((p) => (
                  <div
                    key={p.id}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1a1a2e] transition-colors"
                  >
                    <Avatar profile={p} size="sm" online={p.is_online} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{p.display_name}</p>
                      <p className="text-xs text-purple-300/50 truncate">@{p.username}</p>
                    </div>
                    {isContact(p.id) ? (
                      <span className="text-xs text-green-400 font-medium px-3 py-1.5 bg-green-500/10 rounded-lg">
                        Added
                      </span>
                    ) : (
                      <button
                        onClick={() => addContact(p.id)}
                        className="flex items-center gap-1.5 gradient-purple text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Add
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
