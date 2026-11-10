import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Profile, Gift, Report } from '@/types';
import { Avatar } from '@/components/Avatar';
import {
  Shield, Users, Gift as GiftIcon, Plus, X, Crown, Sparkles,
  TrendingUp, Zap, Flag, Ban, CheckCircle, AlertTriangle, Search,
} from 'lucide-react';

type Tab = 'users' | 'gifts' | 'reports' | 'stats';

export function AdminPanel() {
  const { profile } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [tab, setTab] = useState<Tab>('stats');
  const [users, setUsers] = useState<Profile[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [reports, setReports] = useState<(Report & { reported: Profile; reporter: Profile })[]>([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalChats: 0,
    totalMessages: 0,
    totalStories: 0,
    totalGifts: 0,
    totalCalls: 0,
    totalGroups: 0,
    totalReports: 0,
  });
  const [userSearch, setUserSearch] = useState('');

  const [newGift, setNewGift] = useState({ name: '', emoji: '', description: '', is_nft: false, rarity: 'common', price: 0 });
  const [showGiftForm, setShowGiftForm] = useState(false);

  // Server-side admin check via SECURITY DEFINER function
  useEffect(() => {
    const checkAdmin = async () => {
      const { data, error } = await supabase.rpc('is_admin');
      if (!error) {
        setIsAdmin(!!data);
      } else {
        // Fallback to client-side check (profile.is_owner || profile.is_admin)
        setIsAdmin(!!(profile?.is_owner || profile?.is_admin));
      }
      setCheckingAdmin(false);
    };
    checkAdmin();
  }, [profile]);

  const loadUsers = useCallback(async () => {
    let query = supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (userSearch.trim()) {
      query = query.or(`username.ilike.%${userSearch}%,display_name.ilike.%${userSearch}%`);
    }
    const { data } = await query.limit(100);
    if (data) setUsers(data as Profile[]);
  }, [userSearch]);

  const loadGifts = useCallback(async () => {
    const { data } = await supabase.from('gifts').select('*').order('created_at', { ascending: false });
    if (data) setGifts(data as Gift[]);
  }, []);

  const loadReports = useCallback(async () => {
    const { data } = await supabase
      .from('reports')
      .select('*, reported:reported_id(*), reporter:reporter_id(*)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setReports(data as any);
  }, []);

  const loadStats = useCallback(async () => {
    const [users, chats, messages, stories, gifts, calls, groups, reports] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('chats').select('*', { count: 'exact', head: true }),
      supabase.from('messages').select('*', { count: 'exact', head: true }),
      supabase.from('stories').select('*', { count: 'exact', head: true }).gt('expires_at', new Date().toISOString()),
      supabase.from('gift_transactions').select('*', { count: 'exact', head: true }),
      supabase.from('calls').select('*', { count: 'exact', head: true }),
      supabase.from('groups').select('*', { count: 'exact', head: true }),
      supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    setStats({
      totalUsers: users.count || 0,
      totalChats: chats.count || 0,
      totalMessages: messages.count || 0,
      totalStories: stories.count || 0,
      totalGifts: gifts.count || 0,
      totalCalls: calls.count || 0,
      totalGroups: groups.count || 0,
      totalReports: reports.count || 0,
    });
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
    loadGifts();
    loadReports();
    loadStats();
  }, [isAdmin, loadUsers, loadGifts, loadReports, loadStats]);

  useEffect(() => {
    if (!isAdmin || tab !== 'users') return;
    loadUsers();
  }, [isAdmin, tab, userSearch, loadUsers]);

  if (checkingAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0a0a0f]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-500/40 mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Access denied</p>
          <p className="text-gray-600 text-xs mt-1">Admin privileges required</p>
        </div>
      </div>
    );
  }

  const createGift = async () => {
    if (!newGift.name || !newGift.emoji) return;
    const { data } = await supabase.from('gifts').insert({
      name: newGift.name,
      emoji: newGift.emoji,
      description: newGift.description,
      is_nft: newGift.is_nft,
      rarity: newGift.rarity,
      price: newGift.price,
    }).select('*').maybeSingle();

    if (data) {
      setGifts((prev) => [data as Gift, ...prev]);
      setNewGift({ name: '', emoji: '', description: '', is_nft: false, rarity: 'common', price: 0 });
      setShowGiftForm(false);
    }
  };

  const toggleBan = async (user: Profile) => {
    const newBanned = !user.is_banned;
    await supabase.from('profiles').update({
      is_banned: newBanned,
      banned_at: newBanned ? new Date().toISOString() : null,
    }).eq('id', user.id);
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_banned: newBanned, banned_at: newBanned ? new Date().toISOString() : null } : u));
  };

  const resolveReport = async (reportId: string) => {
    await supabase.from('reports').update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    }).eq('id', reportId);
    loadReports();
    loadStats();
  };

  const statCards = [
    { label: 'Users', value: stats.totalUsers, icon: Users, color: 'from-purple-600 to-fuchsia-600' },
    { label: 'Messages', value: stats.totalMessages, icon: Zap, color: 'from-blue-600 to-purple-600' },
    { label: 'Chats', value: stats.totalChats - stats.totalGroups, icon: Zap, color: 'from-green-600 to-teal-600' },
    { label: 'Groups', value: stats.totalGroups, icon: Users, color: 'from-orange-600 to-red-600' },
    { label: 'Stories', value: stats.totalStories, icon: Zap, color: 'from-pink-600 to-rose-600' },
    { label: 'Gifts Sent', value: stats.totalGifts, icon: GiftIcon, color: 'from-yellow-600 to-amber-600' },
    { label: 'Calls', value: stats.totalCalls, icon: Zap, color: 'from-cyan-600 to-blue-600' },
    { label: 'Reports', value: stats.totalReports, icon: Flag, color: 'from-red-600 to-orange-600' },
  ];

  const tabs = [
    { key: 'stats' as const, label: 'Statistics', icon: TrendingUp },
    { key: 'users' as const, label: 'Users', icon: Users },
    { key: 'reports' as const, label: 'Reports', icon: Flag },
    { key: 'gifts' as const, label: 'Gifts', icon: GiftIcon },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0f] p-4 safe-bottom">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="w-7 h-7 text-purple-400" />
        <h2 className="text-2xl font-bold neon-text">Admin Panel</h2>
        <span className="ml-auto flex items-center gap-1 text-xs text-yellow-400 bg-yellow-500/10 px-3 py-1 rounded-full border border-yellow-500/20">
          <Crown className="w-3 h-3" /> {profile?.is_owner ? 'OWNER' : 'ADMIN'}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 p-1 bg-[#131320] rounded-xl w-fit overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.key ? 'gradient-purple text-white neon-purple' : 'text-gray-400 hover:text-purple-300'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.key === 'reports' && stats.totalReports > 0 && (
              <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {stats.totalReports}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Stats tab */}
      {tab === 'stats' && (
        <div className="anim-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {statCards.map((s) => (
              <div key={s.label} className="glass-panel rounded-2xl p-4 border border-[#1a1a2e]">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-3`}>
                  <s.icon className="w-5 h-5 text-white" />
                </div>
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Recent users */}
          <h3 className="text-sm font-semibold text-purple-300/70 mt-8 mb-3">RECENT USERS</h3>
          <div className="space-y-2">
            {users.slice(0, 5).map((u) => (
              <div key={u.id} className="flex items-center gap-3 bg-[#131320] rounded-xl p-3 border border-[#1a1a2e]">
                <Avatar profile={u} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{u.display_name}</p>
                  <p className="text-xs text-purple-300/50">@{u.username}</p>
                </div>
                {u.is_owner && <Crown className="w-4 h-4 text-yellow-400" />}
                {u.is_banned && <Ban className="w-4 h-4 text-red-400" />}
                <span className="text-xs text-gray-600">{new Date(u.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users tab */}
      {tab === 'users' && (
        <div className="anim-fade-in">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users by username or name..."
              className="w-full bg-[#131320] border border-[#1a1a2e] rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 bg-[#131320] rounded-xl p-3 border border-[#1a1a2e] hover:border-purple-500/20 transition-all">
                <Avatar profile={u} size="md" online={u.is_online} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white truncate">{u.display_name}</p>
                    {u.is_owner && <Crown className="w-4 h-4 text-yellow-400 shrink-0" />}
                    {u.is_banned && <span className="text-[9px] text-red-400 font-bold bg-red-500/10 px-2 py-0.5 rounded">BANNED</span>}
                  </div>
                  <p className="text-xs text-purple-300/50">@{u.username}</p>
                  {u.bio && <p className="text-xs text-gray-500 truncate mt-0.5">{u.bio}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-600">{new Date(u.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</p>
                  {!u.is_owner && (
                    <button
                      onClick={() => toggleBan(u)}
                      className={`mt-1 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                        u.is_banned ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                      }`}
                    >
                      {u.is_banded ? <CheckCircle className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                      {u.is_banned ? 'Unban' : 'Ban'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reports tab */}
      {tab === 'reports' && (
        <div className="anim-fade-in">
          {reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 rounded-full bg-[#131320] flex items-center justify-center mb-4 border border-[#2a2a3e]">
                <Flag className="w-10 h-10 text-purple-500/40" />
              </div>
              <p className="text-gray-400 text-sm">No reports</p>
              <p className="text-gray-600 text-xs mt-1">User reports will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reports.map((r) => (
                <div key={r.id} className={`flex items-center gap-3 bg-[#131320] rounded-xl p-3 border ${r.status === 'pending' ? 'border-red-500/20' : 'border-[#1a1a2e]'}`}>
                  <Avatar profile={r.reported} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">{r.reported.display_name}</p>
                      {r.status === 'pending' && <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />}
                      {r.status === 'resolved' && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      Reported by @{r.reporter.username} — {r.reason}
                    </p>
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      {new Date(r.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {r.status === 'pending' && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => toggleBan(r.reported)}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Ban
                      </button>
                      <button
                        onClick={() => resolveReport(r.id)}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Gifts tab */}
      {tab === 'gifts' && (
        <div className="anim-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-purple-300/70">GIFT CATALOG ({gifts.length})</h3>
            <button
              onClick={() => setShowGiftForm(!showGiftForm)}
              className="flex items-center gap-2 gradient-purple text-white px-4 py-2 rounded-xl text-sm font-semibold neon-purple"
            >
              <Plus className="w-4 h-4" /> Add Gift
            </button>
          </div>

          {showGiftForm && (
            <div className="glass-panel rounded-2xl p-4 mb-4 neon-border anim-slide-up">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Name"
                  value={newGift.name}
                  onChange={(e) => setNewGift({ ...newGift, name: e.target.value })}
                  className="bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none"
                />
                <input
                  type="text"
                  placeholder="Emoji"
                  value={newGift.emoji}
                  onChange={(e) => setNewGift({ ...newGift, emoji: e.target.value })}
                  className="bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none"
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={newGift.description}
                  onChange={(e) => setNewGift({ ...newGift, description: e.target.value })}
                  className="col-span-2 bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none"
                />
                <select
                  value={newGift.rarity}
                  onChange={(e) => setNewGift({ ...newGift, rarity: e.target.value })}
                  className="bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-3 py-2.5 text-sm text-white focus:border-purple-500 outline-none"
                >
                  <option value="common">Common</option>
                  <option value="rare">Rare</option>
                  <option value="epic">Epic</option>
                  <option value="legendary">Legendary</option>
                  <option value="mythic">Mythic</option>
                </select>
                <input
                  type="number"
                  placeholder="Price"
                  value={newGift.price}
                  onChange={(e) => setNewGift({ ...newGift, price: parseInt(e.target.value) || 0 })}
                  className="bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-3 py-2.5 text-sm text-white focus:border-purple-500 outline-none"
                />
                <label className="flex items-center gap-2 col-span-2">
                  <input
                    type="checkbox"
                    checked={newGift.is_nft}
                    onChange={(e) => setNewGift({ ...newGift, is_nft: e.target.checked })}
                    className="w-4 h-4 accent-purple-500"
                  />
                  <span className="text-sm text-purple-300 flex items-center gap-1">
                    <Sparkles className="w-4 h-4 text-fuchsia-400" /> NFT Gift
                  </span>
                </label>
              </div>
              <button
                onClick={createGift}
                disabled={!newGift.name || !newGift.emoji}
                className="w-full gradient-purple text-white py-2.5 rounded-xl text-sm font-semibold neon-purple mt-3 disabled:opacity-50"
              >
                Create Gift
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {gifts.map((g) => (
              <div key={g.id} className="bg-[#131320] rounded-2xl p-4 text-center border border-[#1a1a2e]">
                <div className="text-4xl mb-2">{g.emoji}</div>
                <p className="text-sm font-medium text-white truncate">{g.name}</p>
                <p className="text-xs text-gray-500 truncate mt-0.5">{g.description}</p>
                {g.is_nft && (
                  <span className="inline-flex items-center gap-1 text-[9px] text-fuchsia-400 font-bold mt-1">
                    <Sparkles className="w-3 h-3" /> NFT · {g.rarity}
                  </span>
                )}
                <p className="text-xs text-purple-400 font-bold mt-1">{g.price} stars</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
