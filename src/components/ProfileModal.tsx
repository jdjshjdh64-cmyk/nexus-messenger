import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Profile, GiftTransaction } from '@/types';
import { Avatar } from '@/components/Avatar';
import { X, MessageSquare, Phone, Video, Gift as GiftIcon, Crown, Shield, Edit2, Check, Sparkles, LogOut } from 'lucide-react';

interface ProfileModalProps {
  profile: Profile | null;
  onClose: () => void;
  onMessage: (profile: Profile) => void;
  onCall: (receiverId: string, callType: 'voice' | 'video') => void;
  onSignOut: () => void;
}

export function ProfileModal({ profile: targetProfile, onClose, onMessage, onCall, onSignOut }: ProfileModalProps) {
  const { profile: currentUser, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [receivedGifts, setReceivedGifts] = useState<(GiftTransaction & { gift: { emoji: string; name: string; is_nft: boolean } })[]>([]);
  const [saving, setSaving] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isOwnProfile = targetProfile?.id === currentUser?.id;

  useEffect(() => {
    if (!targetProfile) return;
    setDisplayName(targetProfile.display_name);
    setBio(targetProfile.bio);
    setAvatarUrl(targetProfile.avatar_url || '');
  }, [targetProfile]);

  useEffect(() => {
    if (!targetProfile) return;
    supabase
      .from('gift_transactions')
      .select(`*, gift:gifts(emoji, name, is_nft)`)
      .eq('receiver_id', targetProfile.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setReceivedGifts(data as any);
      });
  }, [targetProfile]);

  if (!targetProfile) return null;

  const saveProfile = async () => {
    if (!currentUser) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      display_name: displayName.trim(),
      bio: bio.trim(),
      avatar_url: avatarUrl.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', currentUser.id);

    if (!error) {
      await refreshProfile();
      setEditing(false);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center p-4 anim-fade-in" onClick={onClose}>
      <div className="w-full max-w-md glass-panel rounded-2xl overflow-hidden anim-scale-in max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Banner */}
        <div className="h-28 gradient-purple relative">
          <button onClick={onClose} className="absolute top-3 right-3 p-2 bg-black/30 rounded-lg hover:bg-black/50 transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
          {targetProfile.is_owner && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-yellow-500/20 backdrop-blur-sm rounded-full px-3 py-1 border border-yellow-500/30">
              <Crown className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-xs font-bold text-yellow-400">OWNER</span>
            </div>
          )}
        </div>

        {/* Avatar */}
        <div className="px-6 -mt-12 relative">
          <Avatar profile={targetProfile} size="xl" ring />
        </div>

        {/* Info */}
        <div className="px-6 py-4">
          {editing && isOwnProfile ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-purple-300/60 font-medium block mb-1">DISPLAY NAME</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-white focus:border-purple-500 outline-none" />
              </div>
              <div>
                <label className="text-xs text-purple-300/60 font-medium block mb-1">BIO</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
                  className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-white focus:border-purple-500 outline-none resize-none" />
              </div>
              <div>
                <label className="text-xs text-purple-300/60 font-medium block mb-1">AVATAR URL</label>
                <input type="text" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none" />
              </div>
              <button onClick={saveProfile} disabled={saving}
                className="w-full gradient-purple text-white py-2.5 rounded-xl text-sm font-semibold neon-purple flex items-center justify-center gap-2">
                <Check className="w-4 h-4" /> Save
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{targetProfile.display_name}</h2>
                {isOwnProfile && (
                  <button onClick={() => setEditing(true)} className="p-1.5 hover:bg-[#1a1a2e] rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4 text-purple-300" />
                  </button>
                )}
              </div>
              <p className="text-purple-300/60 text-sm">@{targetProfile.username}</p>
              {targetProfile.bio && (
                <p className="text-gray-300 text-sm mt-3 leading-relaxed">{targetProfile.bio}</p>
              )}
              <p className="text-xs text-gray-600 mt-2">
                Joined {new Date(targetProfile.created_at).toLocaleDateString('en', { month: 'long', year: 'numeric' })}
              </p>
            </>
          )}

          {/* Action buttons */}
          {!isOwnProfile && !editing && (
            <div className="flex gap-2 mt-4">
              <button onClick={() => onMessage(targetProfile)}
                className="flex-1 flex items-center justify-center gap-2 gradient-purple text-white py-2.5 rounded-xl text-sm font-semibold neon-purple hover:neon-purple-strong transition-all">
                <MessageSquare className="w-4 h-4" /> Message
              </button>
              <button onClick={() => onCall(targetProfile.id, 'voice')}
                className="p-2.5 bg-[#1a1a2e] hover:bg-[#2a2a3e] rounded-xl transition-colors">
                <Phone className="w-5 h-5 text-purple-300" />
              </button>
              <button onClick={() => onCall(targetProfile.id, 'video')}
                className="p-2.5 bg-[#1a1a2e] hover:bg-[#2a2a3e] rounded-xl transition-colors">
                <Video className="w-5 h-5 text-purple-300" />
              </button>
            </div>
          )}

          {/* Log out button (own profile only) */}
          {isOwnProfile && !editing && (
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 py-3 rounded-xl text-sm font-semibold transition-all border border-red-500/20 mt-6"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          )}

          {/* Received gifts showcase */}
          {receivedGifts.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <GiftIcon className="w-4 h-4 text-purple-300" />
                <h3 className="text-sm font-semibold text-purple-300/70">GIFTS RECEIVED</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {receivedGifts.map((g) => (
                  <div key={g.id} className={`relative bg-[#1a1a2e] rounded-xl p-2 ${g.gift?.is_nft ? 'neon-border' : ''}`}>
                    <div className="text-2xl">{g.gift?.emoji}</div>
                    {g.gift?.is_nft && (
                      <Sparkles className="w-3 h-3 text-fuchsia-400 absolute -top-1 -right-1" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Logout confirmation */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 anim-fade-in" onClick={() => setShowLogoutConfirm(false)}>
          <div className="w-full max-w-sm glass-panel rounded-2xl p-6 neon-border anim-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/15 mb-4 mx-auto">
              <LogOut className="w-7 h-7 text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-2">Sign Out?</h3>
            <p className="text-sm text-gray-400 text-center mb-6">You'll be returned to the login screen. You can sign back in with any account.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 rounded-xl bg-[#1a1a2e] text-gray-300 text-sm font-semibold hover:bg-[#2a2a3e] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowLogoutConfirm(false); onClose(); onSignOut(); }}
                className="flex-1 py-3 rounded-xl bg-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/30 border border-red-500/30 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
