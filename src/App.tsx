import { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AuthScreen } from '@/screens/AuthScreen';
import { Sidebar } from '@/components/Sidebar';
import { ChatView } from '@/components/ChatView';
import { StoriesView } from '@/components/StoriesView';
import { GiftsView } from '@/components/GiftsView';
import { CallsView } from '@/components/CallsView';
import { GroupsView, NewGroupModal } from '@/components/GroupsView';
import { ContactsView } from '@/components/ContactsView';
import { SettingsView } from '@/components/SettingsView';
import { AdminPanel } from '@/components/AdminPanel';
import { ProfileModal } from '@/components/ProfileModal';
import { NewChatModal } from '@/components/NewChatModal';
import { CallModal } from '@/components/CallModal';
import { Profile, ChatWithDetails, Notification, Call } from '@/types';
import { supabase } from '@/lib/supabase';
import { Loader2, Zap, Phone, Gift as GiftIcon, MessageSquare, Users, X } from 'lucide-react';

type View = 'chats' | 'contacts' | 'gifts' | 'profile' | 'settings' | 'admin' | 'groups' | 'stories' | 'calls';

function MainApp() {
  const { profile, loading, signOut } = useAuth();
  const [activeView, setActiveView] = useState<View>('chats');
  const [activeChat, setActiveChat] = useState<ChatWithDetails | null>(null);
  const [profileModal, setProfileModal] = useState<Profile | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [callModal, setCallModal] = useState<{ receiverId: string; callType: 'voice' | 'video'; isIncoming?: boolean; callId?: string } | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [incomingCall, setIncomingCall] = useState<{ callId: string; callerId: string; callType: string } | null>(null);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (data) setNotifications(data as Notification[]);
  }, [profile]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Realtime notifications
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('notifications_realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, (payload) => {
        const notif = payload.new as Notification;
        setNotifications((prev) => [notif, ...prev]);

        // Handle incoming call notification
        if (notif.type === 'call' && notif.from_user_id) {
          (async () => {
            const { data: calls } = await supabase
              .from('calls')
              .select('*')
              .eq('caller_id', notif.from_user_id!)
              .eq('receiver_id', profile.id)
              .eq('status', 'ringing')
              .order('created_at', { ascending: false })
              .limit(1);

            if (calls && calls.length > 0) {
              const call = calls[0] as Call;
              setIncomingCall({
                callId: call.id,
                callerId: call.caller_id,
                callType: call.call_type,
              });
            }
          })();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  // Auto-dismiss incoming call after 30s if not answered
  useEffect(() => {
    if (!incomingCall) return;
    const t = setTimeout(() => {
      setIncomingCall(null);
      if (profile) {
        supabase.from('calls').update({ status: 'missed' }).eq('id', incomingCall.callId);
      }
    }, 30000);
    return () => clearTimeout(t);
  }, [incomingCall, profile]);

  // Update online status
  useEffect(() => {
    if (!profile) return;
    supabase.from('profiles').update({ is_online: true, last_seen_at: new Date().toISOString() }).eq('id', profile.id);

    const updateOnline = () => {
      supabase.from('profiles').update({ is_online: true, last_seen_at: new Date().toISOString() }).eq('id', profile.id);
    };
    const interval = setInterval(updateOnline, 60000);

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        supabase.from('profiles').update({ is_online: false, last_seen_at: new Date().toISOString() }).eq('id', profile.id);
      } else {
        supabase.from('profiles').update({ is_online: true, last_seen_at: new Date().toISOString() }).eq('id', profile.id);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      supabase.from('profiles').update({ is_online: false, last_seen_at: new Date().toISOString() }).eq('id', profile.id);
    };
  }, [profile]);

  const handleNewChat = () => setShowNewChat(true);
  const handleNewGroup = () => setShowNewGroup(true);

  const handleSelectChat = (chat: ChatWithDetails) => {
    setActiveChat(chat);
    setActiveView('chats');
  };

  const handleStartCall = (receiverId: string, callType: 'voice' | 'video') => {
    setCallModal({ receiverId, callType });
  };

  const handleMessageFromProfile = async (targetProfile: Profile) => {
    if (!profile) return;
    setProfileModal(null);

    // Find or create a chat
    const { data: myParts } = await supabase
      .from('chat_participants')
      .select('chat_id')
      .eq('user_id', profile.id);

    if (myParts) {
      for (const part of myParts) {
        const { data: cp } = await supabase
          .from('chat_participants')
          .select('user_id, chat_id')
          .eq('chat_id', part.chat_id)
          .neq('user_id', profile.id);

        if (cp && cp.length === 1 && cp[0].user_id === targetProfile.id) {
          const { data: chat } = await supabase
            .from('chats')
            .select('*')
            .eq('id', part.chat_id)
            .eq('is_group', false)
            .maybeSingle();

          if (chat) {
            handleSelectChat({ ...(chat as any), participants: [profile, targetProfile] });
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

    if (newChat) {
      await supabase.from('chat_participants').insert([
        { chat_id: (newChat as any).id, user_id: profile.id },
        { chat_id: (newChat as any).id, user_id: targetProfile.id },
      ]);
      handleSelectChat({ ...(newChat as any), participants: [profile, targetProfile] });
    }
  };

  const markNotifRead = async (notifId: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', notifId);
    setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, read: true } : n)));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Loading screen
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-purple neon-purple-strong mb-4 anim-pulse-glow">
            <Zap className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>
          <Loader2 className="w-6 h-6 text-purple-400 animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return <AuthScreen />;
  }

  return (
    <div className="h-screen flex bg-[#0a0a0f] overflow-hidden safe-top safe-bottom">
      {/* Sidebar - hidden on mobile when chat is open */}
      <div className={`${activeChat && activeView === 'chats' ? 'hidden sm:flex' : 'flex'} h-full`}>
        <Sidebar
          activeView={activeView}
          setActiveView={(v) => { setActiveView(v as View); setActiveChat(null); }}
          activeChatId={activeChat?.id || null}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onNewGroup={handleNewGroup}
          onOpenProfile={setProfileModal}
          notifCount={unreadCount}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 h-full flex flex-col">
        {activeChat && activeView === 'chats' ? (
          <ChatView
            chat={activeChat}
            onBack={() => setActiveChat(null)}
            onOpenProfile={setProfileModal}
            onCall={handleStartCall}
          />
        ) : activeView === 'chats' ? (
          <div className="flex-1 flex items-center justify-center bg-[#0a0a0f]">
            <div className="text-center px-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl gradient-purple neon-purple mb-4">
                <Zap className="w-10 h-10 text-white" strokeWidth={2.5} />
              </div>
              <h2 className="text-xl font-bold neon-text mb-2">Welcome to NEXUS</h2>
              <p className="text-gray-500 text-sm">Select a chat or start a new conversation</p>
            </div>
          </div>
        ) : activeView === 'contacts' ? (
          <ContactsView
            onOpenProfile={setProfileModal}
            onMessage={handleMessageFromProfile}
          />
        ) : activeView === 'stories' ? (
          <StoriesView onOpenProfile={setProfileModal} />
        ) : activeView === 'gifts' ? (
          <GiftsView onOpenProfile={setProfileModal} />
        ) : activeView === 'calls' ? (
          <CallsView onOpenProfile={setProfileModal} onCall={handleStartCall} />
        ) : activeView === 'groups' ? (
          <GroupsView onOpenChat={handleSelectChat} onNewGroup={handleNewGroup} />
        ) : activeView === 'settings' ? (
          <SettingsView onSignOut={signOut} />
        ) : activeView === 'admin' ? (
          <AdminPanel />
        ) : activeView === 'profile' ? null : null}
      </div>

      {/* Notification panel */}
      {showNotifPanel && (
        <div className="fixed inset-0 z-30" onClick={() => setShowNotifPanel(false)}>
          <div className="absolute top-0 right-0 w-80 max-w-[90vw] h-full glass-panel border-l border-[#1a1a2e] p-4 overflow-y-auto anim-slide-right" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Notifications</h3>
              <button onClick={() => setShowNotifPanel(false)} className="p-2 hover:bg-[#1a1a2e] rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            {notifications.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">No notifications</p>
            ) : (
              <div className="space-y-2">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => { markNotifRead(n.id); setShowNotifPanel(false); }}
                    className={`w-full text-left p-3 rounded-xl transition-colors ${n.read ? 'bg-[#131320]' : 'bg-purple-500/10 border border-purple-500/20'}`}
                  >
                    <div className="flex items-start gap-2">
                      {n.type === 'call' ? <Phone className="w-4 h-4 text-purple-300 mt-0.5" /> :
                       n.type === 'gift' ? <GiftIcon className="w-4 h-4 text-fuchsia-300 mt-0.5" /> :
                       n.type === 'group' ? <Users className="w-4 h-4 text-blue-300 mt-0.5" /> :
                       <MessageSquare className="w-4 h-4 text-purple-300 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{n.title}</p>
                        <p className="text-xs text-gray-400 truncate">{n.body}</p>
                        <p className="text-[10px] text-gray-600 mt-0.5">
                          {new Date(n.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {!n.read && <div className="w-2 h-2 bg-purple-500 rounded-full shrink-0 mt-1.5" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notification bell button (fixed) */}
      {unreadCount > 0 && !showNotifPanel && (
        <button
          onClick={() => setShowNotifPanel(true)}
          className="fixed top-4 right-4 z-20 p-3 gradient-purple rounded-xl neon-purple anim-pulse-glow hidden sm:block"
        >
          <div className="relative">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </div>
        </button>
      )}

      {/* Incoming call notification */}
      {incomingCall && !callModal && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 glass-panel rounded-2xl p-4 neon-border anim-slide-up w-80 max-w-[90vw]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full gradient-purple flex items-center justify-center anim-pulse-glow">
              {incomingCall.callType === 'video' ? (
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              ) : (
                <Phone className="w-6 h-6 text-white" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Incoming {incomingCall.callType} call</p>
              <p className="text-xs text-purple-300/60">Tap to answer</p>
            </div>
            <button
              onClick={() => {
                setCallModal({
                  receiverId: incomingCall.callerId,
                  callType: incomingCall.callType as 'voice' | 'video',
                  isIncoming: true,
                  callId: incomingCall.callId,
                });
                setIncomingCall(null);
              }}
              className="px-3 py-1.5 bg-green-500 hover:bg-green-600 rounded-lg text-xs font-bold text-white transition-colors"
            >
              Answer
            </button>
            <button
              onClick={() => setIncomingCall(null)}
              className="p-1.5 hover:bg-[#1a1a2e] rounded-lg"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onChatCreated={(chat) => { setShowNewChat(false); handleSelectChat(chat); }}
        />
      )}

      {showNewGroup && (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onCreated={(chat) => { setShowNewGroup(false); handleSelectChat(chat); }}
        />
      )}

      {profileModal && (
        <ProfileModal
          profile={profileModal}
          onClose={() => setProfileModal(null)}
          onMessage={handleMessageFromProfile}
          onCall={handleStartCall}
          onSignOut={signOut}
        />
      )}

      {callModal && (
        <CallModal
          receiverId={callModal.receiverId}
          callType={callModal.callType}
          isIncoming={callModal.isIncoming}
          callId={callModal.callId}
          onClose={() => setCallModal(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
