import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Profile, Gift, GiftTransaction } from '@/types';
import { Avatar } from '@/components/Avatar';
import { Gift as GiftIcon, Send, X, Sparkles } from 'lucide-react';

interface GiftsViewProps {
  onOpenProfile: (profile: Profile) => void;
}

export function GiftsView({ onOpenProfile }: GiftsViewProps) {
  const { profile } = useAuth();
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [transactions, setTransactions] = useState<(GiftTransaction & { gift: Gift; sender: Profile; receiver: Profile })[]>([]);
  const [filter, setFilter] = useState<'all' | 'sent' | 'received' | 'nft'>('all');
  const [sending, setSending] = useState<Gift | null>(null);
  const [searchUser, setSearchUser] = useState('');
  const [userResults, setUserResults] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [giftMsg, setGiftMsg] = useState('');

  const loadGifts = useCallback(async () => {
    const { data } = await supabase.from('gifts').select('*').order('is_nft', { ascending: false }).order('price', { ascending: true });
    if (data) setGifts(data as Gift[]);
  }, []);

  const loadTransactions = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('gift_transactions')
      .select(`
        *,
        gift:gifts(*),
        sender:sender_id(*),
        receiver:receiver_id(*)
      `)
      .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) setTransactions(data as any);
  }, [profile]);

  useEffect(() => {
    loadGifts();
    loadTransactions();
  }, [loadGifts, loadTransactions]);

  useEffect(() => {
    if (searchUser.trim().length < 2) { setUserResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${searchUser}%,display_name.ilike.%${searchUser}%`)
        .neq('id', profile?.id || '')
        .limit(5);
      setUserResults((data || []) as Profile[]);
    }, 300);
    return () => clearTimeout(t);
  }, [searchUser, profile]);

  const sendGift = async () => {
    if (!profile || !sending || !selectedUser) return;

    const { data: txn } = await supabase.from('gift_transactions').insert({
      gift_id: sending.id,
      sender_id: profile.id,
      receiver_id: selectedUser.id,
      message: giftMsg.trim() || `Sent you a ${sending.name}!`,
    }).select('*').maybeSingle();

    if (txn) {
      await supabase.from('notifications').insert({
        user_id: selectedUser.id,
        type: 'gift',
        title: profile.display_name,
        body: `Sent you a ${sending.name} ${sending.emoji}!`,
        from_user_id: profile.id,
      });

      setSending(null);
      setSelectedUser(null);
      setSearchUser('');
      setGiftMsg('');
      loadTransactions();
    }
  };

  const filteredTxns = transactions.filter((t) => {
    if (filter === 'sent') return t.sender_id === profile?.id;
    if (filter === 'received') return t.receiver_id === profile?.id;
    if (filter === 'nft') return t.gift?.is_nft;
    return true;
  });

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0f] p-4">
      <div className="flex items-center gap-2 mb-6">
        <GiftIcon className="w-7 h-7 text-purple-400" />
        <h2 className="text-2xl font-bold neon-text">Gifts & NFTs</h2>
      </div>

      {/* Gift catalog */}
      <h3 className="text-sm font-semibold text-purple-300/70 mb-3">GIFT SHOP</h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-8">
        {gifts.map((gift) => (
          <button key={gift.id} onClick={() => { setSending(gift); setSelectedUser(null); setSearchUser(''); }}
            className="bg-[#131320] hover:bg-[#1a1a2e] rounded-2xl p-4 text-center transition-all hover:neon-border group border border-[#1a1a2e]">
            <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">{gift.emoji}</div>
            <p className="text-xs font-medium text-white truncate">{gift.name}</p>
            {gift.is_nft ? (
              <span className="text-[9px] text-fuchsia-400 font-bold mt-1 block">
                <Sparkles className="w-3 h-3 inline mr-1" />NFT · {gift.rarity}
              </span>
            ) : (
              <span className="text-[10px] text-purple-300/40 mt-1 block">{gift.rarity}</span>
            )}
            <span className="text-xs text-purple-400 font-bold mt-1 block">{gift.price} ⭐</span>
            <div className="mt-2 text-[10px] text-purple-300/60 opacity-0 group-hover:opacity-100 transition-opacity">
              Tap to send
            </div>
            </button>
        ))}
      </div>

      {/* Transaction history */}
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-purple-300/70">HISTORY</h3>
        <div className="flex gap-1 ml-auto">
          {(['all', 'sent', 'received', 'nft'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all capitalize ${
                filter === f ? 'gradient-purple text-white' : 'bg-[#1a1a2e] text-gray-400 hover:text-purple-300'
              }`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {filteredTxns.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">No gift transactions yet</div>
      ) : (
        <div className="space-y-2">
          {filteredTxns.map((txn) => {
            const isSent = txn.sender_id === profile?.id;
            const otherUser = isSent ? txn.receiver : txn.sender;
            return (
              <div key={txn.id} className="flex items-center gap-3 bg-[#131320] rounded-xl p-3 border border-[#1a1a2e]">
                <div className="text-3xl">{txn.gift?.emoji}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">
                    {isSent ? 'Sent to ' : 'Received from '}
                    <button onClick={() => onOpenProfile(otherUser)} className="text-purple-300 hover:underline">
                      {otherUser?.display_name}
                    </button>
                  </p>
                  <p className="text-xs text-gray-500 truncate">{txn.message}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">
                    {new Date(txn.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {txn.gift?.is_nft && (
                  <span className="text-[9px] text-fuchsia-400 font-bold bg-fuchsia-500/10 px-2 py-1 rounded">
                    NFT
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Send gift modal */}
      {sending && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 anim-fade-in" onClick={() => setSending(null)}>
          <div className="w-full max-w-sm glass-panel rounded-2xl p-6 neon-border anim-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Send Gift</h3>
              <button onClick={() => setSending(null)} className="p-2 hover:bg-[#1a1a2e] rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="flex items-center gap-3 bg-[#1a1a2e] rounded-xl p-4 mb-4">
              <div className="text-4xl">{sending.emoji}</div>
              <div>
                <p className="font-semibold text-white">{sending.name}</p>
                <p className="text-xs text-gray-400">{sending.description}</p>
                {sending.is_nft && <span className="text-[10px] text-fuchsia-400 font-bold">NFT · {sending.rarity}</span>}
              </div>
            </div>

            {!selectedUser ? (
              <>
                <p className="text-xs text-purple-300/60 mb-2 font-medium">SEARCH USER</p>
                <input type="text" value={searchUser} onChange={(e) => setSearchUser(e.target.value)}
                  placeholder="Search by username or name..."
                  className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none mb-3" />
                <div className="space-y-1">
                  {userResults.map((u) => (
                    <button key={u.id} onClick={() => setSelectedUser(u)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[#1a1a2e] transition-colors">
                      <Avatar profile={u} size="sm" />
                      <div className="text-left">
                        <p className="text-sm font-medium text-white">{u.display_name}</p>
                        <p className="text-xs text-purple-300/50">@{u.username}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 bg-[#1a1a2e] rounded-xl p-3 mb-3">
                  <Avatar profile={selectedUser} size="sm" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{selectedUser.display_name}</p>
                    <p className="text-xs text-purple-300/50">@{selectedUser.username}</p>
                  </div>
                  <button onClick={() => { setSelectedUser(null); setSearchUser(''); }}
                    className="p-1 hover:bg-[#2a2a3e] rounded-lg">
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
                <input type="text" value={giftMsg} onChange={(e) => setGiftMsg(e.target.value)}
                  placeholder="Add a message..."
                  className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none mb-4" />
                <button onClick={sendGift}
                  className="w-full gradient-purple text-white font-semibold py-3 rounded-xl neon-purple hover:neon-purple-strong transition-all flex items-center justify-center gap-2">
                  <Send className="w-4 h-4" />
                  Send {sending.emoji} {sending.name}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
