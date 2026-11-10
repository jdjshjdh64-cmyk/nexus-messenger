import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/Avatar';
import {
  Settings, LogOut, Edit2, Check, Bell, Shield, Zap, Crown,
  Lock, Eye, Volume2, Key, Image as ImageIcon, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface SettingsViewProps {
  onSignOut: () => void;
}

type SettingsSection = 'main' | 'password' | 'privacy' | 'notifications';

export function SettingsView({ onSignOut }: SettingsViewProps) {
  const { profile, refreshProfile } = useAuth();
  const [section, setSection] = useState<SettingsSection>('main');
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Password change
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  // Privacy settings (local state)
  const [readReceipts, setReadReceipts] = useState(true);
  const [onlineStatus, setOnlineStatus] = useState(true);
  const [allowSearch, setAllowSearch] = useState(true);

  // Notification settings (local state)
  const [notifMessages, setNotifMessages] = useState(true);
  const [notifGifts, setNotifGifts] = useState(true);
  const [notifCalls, setNotifCalls] = useState(true);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      display_name: displayName.trim(),
      bio: bio.trim(),
      avatar_url: avatarUrl.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', profile.id);

    if (!error) {
      await refreshProfile();
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  const uploadAvatar = async (file: File) => {
    if (!profile) return;
    setUploadingAvatar(true);

    const fileExt = file.name.split('.').pop();
    const fileName = `${profile.id}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      setUploadingAvatar(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('chat-media')
      .getPublicUrl(filePath);

    if (urlData?.publicUrl) {
      setAvatarUrl(urlData.publicUrl);
      await supabase.from('profiles').update({
        avatar_url: urlData.publicUrl,
        updated_at: new Date().toISOString(),
      }).eq('id', profile.id);
      await refreshProfile();
    }

    setUploadingAvatar(false);
  };

  const changePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordError(error.message);
    } else {
      setPasswordSuccess('Password updated successfully');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(null), 3000);
    }
    setChangingPassword(false);
  };

  if (!profile) return null;

  // Password section
  if (section === 'password') {
    return (
      <div className="flex-1 overflow-y-auto bg-[#0a0a0f] p-4 safe-bottom">
        <button
          onClick={() => setSection('main')}
          className="flex items-center gap-2 text-sm text-purple-300 hover:text-purple-200 transition-colors mb-6"
        >
          <Zap className="w-4 h-4 rotate-180" /> Back to Settings
        </button>

        <div className="flex items-center gap-2 mb-6">
          <Key className="w-7 h-7 text-purple-400" />
          <h2 className="text-2xl font-bold neon-text">Change Password</h2>
        </div>

        <div className="glass-panel rounded-2xl p-6 neon-border space-y-4">
          <div>
            <label className="text-xs text-purple-300/60 font-medium block mb-1.5">NEW PASSWORD</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-purple-300/60 font-medium block mb-1.5">CONFIRM PASSWORD</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none"
            />
          </div>

          {passwordError && (
            <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
              {passwordError}
            </div>
          )}
          {passwordSuccess && (
            <div className="text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2.5 anim-fade-in">
              {passwordSuccess}
            </div>
          )}

          <button
            onClick={changePassword}
            disabled={changingPassword || !newPassword || !confirmPassword}
            className="w-full gradient-purple text-white py-3 rounded-xl text-sm font-semibold neon-purple flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            {changingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>
    );
  }

  // Privacy section
  if (section === 'privacy') {
    return (
      <div className="flex-1 overflow-y-auto bg-[#0a0a0f] p-4 safe-bottom">
        <button
          onClick={() => setSection('main')}
          className="flex items-center gap-2 text-sm text-purple-300 hover:text-purple-200 transition-colors mb-6"
        >
          <Zap className="w-4 h-4 rotate-180" /> Back to Settings
        </button>

        <div className="flex items-center gap-2 mb-6">
          <Shield className="w-7 h-7 text-purple-400" />
          <h2 className="text-2xl font-bold neon-text">Privacy</h2>
        </div>

        <div className="glass-panel rounded-2xl p-4 mb-4 space-y-4">
          <ToggleRow
            icon={<Check className="w-5 h-5 text-purple-300" />}
            label="Read receipts"
            desc="Show others when you've read their messages"
            value={readReceipts}
            onChange={setReadReceipts}
          />
          <div className="h-px bg-[#1a1a2e]" />
          <ToggleRow
            icon={<Eye className="w-5 h-5 text-purple-300" />}
            label="Online status"
            desc="Show when you're online"
            value={onlineStatus}
            onChange={setOnlineStatus}
          />
          <div className="h-px bg-[#1a1a2e]" />
          <ToggleRow
            icon={<Settings className="w-5 h-5 text-purple-300" />}
            label="Allow search"
            desc="Let other users find you by username"
            value={allowSearch}
            onChange={setAllowSearch}
          />
        </div>
      </div>
    );
  }

  // Notifications section
  if (section === 'notifications') {
    return (
      <div className="flex-1 overflow-y-auto bg-[#0a0a0f] p-4 safe-bottom">
        <button
          onClick={() => setSection('main')}
          className="flex items-center gap-2 text-sm text-purple-300 hover:text-purple-200 transition-colors mb-6"
        >
          <Zap className="w-4 h-4 rotate-180" /> Back to Settings
        </button>

        <div className="flex items-center gap-2 mb-6">
          <Bell className="w-7 h-7 text-purple-400" />
          <h2 className="text-2xl font-bold neon-text">Notifications</h2>
        </div>

        <div className="glass-panel rounded-2xl p-4 mb-4 space-y-4">
          <ToggleRow
            icon={<Settings className="w-5 h-5 text-purple-300" />}
            label="Message notifications"
            desc="Notify when you receive new messages"
            value={notifMessages}
            onChange={setNotifMessages}
          />
          <div className="h-px bg-[#1a1a2e]" />
          <ToggleRow
            icon={<Zap className="w-5 h-5 text-purple-300" />}
            label="Gift notifications"
            desc="Notify when you receive gifts"
            value={notifGifts}
            onChange={setNotifGifts}
          />
          <div className="h-px bg-[#1a1a2e]" />
          <ToggleRow
            icon={<Volume2 className="w-5 h-5 text-purple-300" />}
            label="Call notifications"
            desc="Notify for incoming calls"
            value={notifCalls}
            onChange={setNotifCalls}
          />
        </div>
      </div>
    );
  }

  // Main settings
  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0f] p-4 safe-bottom">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="w-7 h-7 text-purple-400" />
        <h2 className="text-2xl font-bold neon-text">Settings</h2>
      </div>

      {/* Profile card */}
      <div className="glass-panel rounded-2xl p-6 mb-4 neon-border">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative">
            <Avatar profile={profile} size="xl" ring online={profile.is_online} />
            {editing && (
              <label className="absolute -bottom-1 -right-1 w-7 h-7 gradient-purple rounded-full flex items-center justify-center cursor-pointer border-2 border-[#0a0a0f]">
                {uploadingAvatar ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-white" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadAvatar(file);
                  }}
                />
              </label>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white truncate">{profile.display_name}</h3>
              {profile.is_owner && <Crown className="w-4 h-4 text-yellow-400" />}
            </div>
            <p className="text-purple-300/60 text-sm">@{profile.username}</p>
            {profile.is_owner && (
              <span className="inline-flex items-center gap-1 mt-1 text-xs text-yellow-400 font-medium">
                <Shield className="w-3 h-3" /> Owner & Admin
              </span>
            )}
          </div>
          {!editing && (
            <button onClick={() => setEditing(true)} className="p-2 bg-[#1a1a2e] hover:bg-[#2a2a3e] rounded-lg transition-colors">
              <Edit2 className="w-4 h-4 text-purple-300" />
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3 anim-fade-in">
            <div>
              <label className="text-xs text-purple-300/60 font-medium block mb-1">DISPLAY NAME</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-3 py-2.5 text-sm text-white focus:border-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-purple-300/60 font-medium block mb-1">BIO</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-3 py-2.5 text-sm text-white focus:border-purple-500 outline-none resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-purple-300/60 font-medium block mb-1">AVATAR URL</label>
              <input
                type="text"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none"
              />
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="w-full gradient-purple text-white py-2.5 rounded-xl text-sm font-semibold neon-purple flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Check className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {profile.bio && (
              <p className="text-sm text-gray-300 leading-relaxed">{profile.bio}</p>
            )}
            <p className="text-xs text-gray-600">
              Joined {new Date(profile.created_at).toLocaleDateString('en', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        )}

        {saved && (
          <div className="mt-3 text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 anim-fade-in">
            Profile updated successfully
          </div>
        )}
      </div>

      {/* Settings menu items */}
      <div className="glass-panel rounded-2xl p-2 mb-4">
        <button
          onClick={() => setSection('password')}
          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1a1a2e] transition-colors"
        >
          <Key className="w-5 h-5 text-purple-300" />
          <span className="text-sm text-white font-medium flex-1 text-left">Change Password</span>
          <Zap className="w-4 h-4 text-gray-600 rotate-[-90deg]" />
        </button>
        <button
          onClick={() => setSection('privacy')}
          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1a1a2e] transition-colors"
        >
          <Shield className="w-5 h-5 text-purple-300" />
          <span className="text-sm text-white font-medium flex-1 text-left">Privacy</span>
          <Zap className="w-4 h-4 text-gray-600 rotate-[-90deg]" />
        </button>
        <button
          onClick={() => setSection('notifications')}
          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1a1a2e] transition-colors"
        >
          <Bell className="w-5 h-5 text-purple-300" />
          <span className="text-sm text-white font-medium flex-1 text-left">Notifications</span>
          <Zap className="w-4 h-4 text-gray-600 rotate-[-90deg]" />
        </button>
      </div>

      {/* Account info */}
      <div className="glass-panel rounded-2xl p-4 mb-4 space-y-3">
        <div className="flex items-center gap-3 p-2">
          <Bell className="w-5 h-5 text-purple-300" />
          <span className="text-sm text-gray-300 flex-1">Notifications</span>
          <span className="text-xs text-gray-600">In-app</span>
        </div>
        <div className="flex items-center gap-3 p-2">
          <Zap className="w-5 h-5 text-purple-300" />
          <span className="text-sm text-gray-300 flex-1">Account type</span>
          <span className="text-xs text-purple-400 font-medium">
            {profile.is_owner ? 'Owner' : 'User'}
          </span>
        </div>
      </div>

      {/* About */}
      <div className="glass-panel rounded-2xl p-6 mb-4 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl gradient-purple mb-3 neon-purple">
          <Zap className="w-6 h-6 text-white" strokeWidth={2.5} />
        </div>
        <h3 className="text-lg font-bold neon-text">NEXUS</h3>
        <p className="text-xs text-gray-500 mt-1">Next-gen messaging platform</p>
        <p className="text-xs text-gray-600 mt-2">Version 4.0.0</p>
      </div>

      {/* Sign out */}
      <button
        onClick={() => setShowLogoutConfirm(true)}
        className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 py-3 rounded-xl text-sm font-semibold transition-all border border-red-500/20"
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>

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
                onClick={() => { setShowLogoutConfirm(false); onSignOut(); }}
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

function ToggleRow({
  icon,
  label,
  desc,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-2">
      {icon}
      <div className="flex-1">
        <p className="text-sm text-white font-medium">{label}</p>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full transition-colors relative ${value ? 'gradient-purple' : 'bg-[#2a2a3e]'}`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${value ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  );
}
