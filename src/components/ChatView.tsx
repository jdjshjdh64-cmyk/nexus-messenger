import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Profile, ChatWithDetails, Message, Gift, GiftTransaction, MessageReaction } from '@/types';
import { Avatar } from '@/components/Avatar';
import {
  Phone, Video, Send, Smile, Gift as GiftIcon, ImageIcon, X, ArrowLeft, Users,
  Reply, Trash2, Edit2, Check, Pin, MoreVertical, Forward,
} from 'lucide-react';

interface ChatViewProps {
  chat: ChatWithDetails;
  onBack: () => void;
  onOpenProfile: (profile: Profile) => void;
  onCall: (receiverId: string, callType: 'voice' | 'video') => void;
}

const EMOJIS = ['😀','😂','🥰','😍','🤔','😎','😢','😡','👍','👎','❤️','🔥','🎉','🎂','🌟','💎','🌹','💕','😘','🤗','😴','🤯','🥳','😱','🙏','👏','💪','🤝','✌️','🤞','💯','⚡','🌙','☀️','🌈','🍕','☕','🎮','🎵','📚','🚀','👻','🤖','🐾','🌸','🦄','💀','👽','🎁','🏆'];

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '🎉', '👏'];

const GIF_CATEGORIES = [
  { query: 'hello', label: 'Hello' },
  { query: 'love', label: 'Love' },
  { query: 'happy dance', label: 'Dance' },
  { query: 'thumbs up', label: 'Yes' },
  { query: 'sad', label: 'Sad' },
  { query: 'celebrate', label: 'Party' },
  { query: 'cute cat', label: 'Cats' },
  { query: 'wow', label: 'Wow' },
];

const PAGE_SIZE = 50;

export function ChatView({ chat, onBack, onOpenProfile, onCall }: ChatViewProps) {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [showGifs, setShowGifs] = useState(false);
  const [showGifts, setShowGifts] = useState(false);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [gifs, setGifs] = useState<string[]>([]);
  const [gifQuery, setGifQuery] = useState('hello');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [reactionPickerId, setReactionPickerId] = useState<string | null>(null);
  const [reactionsMap, setReactionsMap] = useState<Record<string, MessageReaction[]>>({});
  const [pinnedMessage, setPinnedMessage] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [forwardModal, setForwardModal] = useState<Message | null>(null);
  const [forwardContacts, setForwardContacts] = useState<ChatWithDetails[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  const otherUser = chat.participants.find((p) => p.id !== profile?.id);

  const loadMessages = useCallback(async (page = 0) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chat.id)
      .order('created_at', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    const msgs = (data || []) as Message[];
    if (page === 0) {
      setMessages(msgs);
      setHasMore(msgs.length === PAGE_SIZE);
    } else {
      setMessages((prev) => [...msgs, ...prev]);
      setHasMore(msgs.length === PAGE_SIZE);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [chat.id]);

  const loadReactions = useCallback(async () => {
    if (messages.length === 0) return;
    const messageIds = messages.map((m) => m.id);
    const { data } = await supabase
      .from('message_reactions')
      .select('*')
      .in('message_id', messageIds);
    if (data) {
      const map: Record<string, MessageReaction[]> = {};
      (data as MessageReaction[]).forEach((r) => {
        if (!map[r.message_id]) map[r.message_id] = [];
        map[r.message_id].push(r);
      });
      setReactionsMap(map);
    }
  }, [messages]);

  const markAsRead = useCallback(async () => {
    if (!profile) return;
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('chat_id', chat.id)
      .is('read_at', null)
      .neq('sender_id', profile.id);
  }, [chat.id, profile]);

  useEffect(() => {
    loadMessages(0);
    markAsRead();
  }, [loadMessages, markAsRead]);

  useEffect(() => {
    loadReactions();
  }, [loadReactions]);

  // Load pinned message
  useEffect(() => {
    supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chat.id)
      .eq('is_pinned', true)
      .order('pinned_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPinnedMessage(data as Message);
      });
  }, [chat.id]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`chat_${chat.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chat.id}`,
      }, (payload) => {
        setMessages((prev) => {
          if (prev.find((m) => m.id === (payload.new as Message).id)) return prev;
          return [...prev, payload.new as Message];
        });
        markAsRead();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chat.id}`,
      }, (payload) => {
        const updated = payload.new as Message;
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        if (updated.is_pinned) setPinnedMessage(updated);
        else if (pinnedMessage?.id === updated.id) setPinnedMessage(null);
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chat.id}`,
      }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'message_reactions',
      }, () => loadReactions())
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'message_reactions',
      }, () => loadReactions())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chat.id, markAsRead, loadReactions, pinnedMessage]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Load gifts
  useEffect(() => {
    supabase.from('gifts').select('*').then(({ data }) => {
      if (data) setGifts(data as Gift[]);
    });
  }, []);

  // Load GIFs
  useEffect(() => {
    if (!showGifs) return;
    fetchGifs(gifQuery);
  }, [showGifs, gifQuery]);

  // Typing indicator cleanup
  useEffect(() => {
    if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    typingTimerRef.current = setInterval(() => {
      setTypingUsers((prev) => (prev.length > 0 ? [] : prev));
    }, 4000);
    return () => { if (typingTimerRef.current) clearInterval(typingTimerRef.current); };
  }, []);

  const fetchGifs = async (query: string) => {
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(query)}&limit=20&rating=pg`);
      const data = await res.json();
      if (data.data) {
        setGifs(data.data.map((g: any) => g.images.fixed_height_small.url));
      }
    } catch {
      setGifs([]);
    }
  };

  const sendTyping = () => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 3000) return;
    lastTypingSentRef.current = now;
    // Realtime broadcast for typing (uses channel presence-like mechanism)
    supabase.channel(`typing_${chat.id}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: profile?.id, username: profile?.display_name },
    });
  };

  const sendMessage = async (type: Message['message_type'] = 'text', content?: string, gifUrl?: string) => {
    if (!profile) return;
    const text = content ?? input.trim();
    if (type === 'text' && !text) return;

    const msgData: any = {
      chat_id: chat.id,
      sender_id: profile.id,
      content: text || '',
      message_type: type,
    };
    if (gifUrl) msgData.gif_url = gifUrl;
    if (replyTo) msgData.reply_to_id = replyTo.id;

    const { data } = await supabase.from('messages').insert(msgData).select('*').maybeSingle();
    if (data) {
      setMessages((prev) => [...prev, data as Message]);
      setInput('');
      setShowEmojis(false);
      setShowGifs(false);
      setReplyTo(null);

      const recipients = chat.participants.filter((p) => p.id !== profile.id);
      for (const recipient of recipients) {
        await supabase.from('notifications').insert({
          user_id: recipient.id,
          type: 'message',
          title: profile.display_name,
          body: type === 'gif' ? 'Sent a GIF' : type === 'image' ? 'Sent a photo' : type === 'voice' ? 'Sent a voice message' : text,
          from_user_id: profile.id,
        });
      }
    }
  };

  const sendGift = async (gift: Gift) => {
    if (!profile || !otherUser) return;

    const { data: txn } = await supabase.from('gift_transactions').insert({
      gift_id: gift.id,
      sender_id: profile.id,
      receiver_id: otherUser.id,
      message: `Sent you a ${gift.name}!`,
    }).select('*').maybeSingle();

    if (txn) {
      const { data: msg } = await supabase.from('messages').insert({
        chat_id: chat.id,
        sender_id: profile.id,
        content: `${gift.emoji} ${gift.name}`,
        message_type: 'gift',
        gift_id: (txn as GiftTransaction).id,
      }).select('*').maybeSingle();

      if (msg) {
        setMessages((prev) => [...prev, msg as Message]);
        setShowGifts(false);
      }

      await supabase.from('notifications').insert({
        user_id: otherUser.id,
        type: 'gift',
        title: profile.display_name,
        body: `Sent you a ${gift.name} ${gift.emoji}!`,
        from_user_id: profile.id,
      });
    }
  };

  const editMessage = async (msgId: string) => {
    if (!editText.trim()) return;
    await supabase.from('messages').update({
      content: editText.trim(),
      is_edited: true,
      edited_at: new Date().toISOString(),
    }).eq('id', msgId);
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: editText.trim(), is_edited: true, edited_at: new Date().toISOString() } : m)));
    setEditingId(null);
    setEditText('');
    setMenuOpenId(null);
  };

  const deleteMessage = async (msgId: string) => {
    await supabase.from('messages').delete().eq('id', msgId);
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    setMenuOpenId(null);
  };

  const togglePin = async (msg: Message) => {
    if (msg.is_pinned) {
      await supabase.from('messages').update({ is_pinned: false, pinned_at: null }).eq('id', msg.id);
      setPinnedMessage(null);
    } else {
      await supabase.from('messages').update({ is_pinned: false, pinned_at: null }).eq('chat_id', chat.id).eq('is_pinned', true);
      await supabase.from('messages').update({ is_pinned: true, pinned_at: new Date().toISOString() }).eq('id', msg.id);
      setPinnedMessage({ ...msg, is_pinned: true, pinned_at: new Date().toISOString() });
    }
    setMenuOpenId(null);
  };

  const toggleReaction = async (msgId: string, emoji: string) => {
    if (!profile) return;
    const existing = reactionsMap[msgId]?.find((r) => r.user_id === profile.id && r.emoji === emoji);
    if (existing) {
      await supabase.from('message_reactions').delete().eq('id', existing.id);
    } else {
      await supabase.from('message_reactions').insert({
        message_id: msgId,
        user_id: profile.id,
        emoji,
      });
    }
    setReactionPickerId(null);
    loadReactions();
  };

  const forwardMessage = async (msg: Message, targetChatId: string) => {
    if (!profile) return;
    await supabase.from('messages').insert({
      chat_id: targetChatId,
      sender_id: profile.id,
      content: msg.content,
      message_type: msg.message_type,
      gif_url: msg.gif_url,
      forwarded_from: profile.id,
    });
    setForwardModal(null);
  };

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = Math.ceil(messages.length / PAGE_SIZE);
    loadMessages(nextPage);
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (container.scrollTop < 50 && hasMore) {
      loadMore();
    }
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });

  const getReplyMessage = (msg: Message): Message | null => {
    if (!msg.reply_to_id) return null;
    return messages.find((m) => m.id === msg.reply_to_id) || null;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-[#1a1a2e] glass-panel safe-top">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-[#1a1a2e] transition-colors sm:hidden">
          <ArrowLeft className="w-5 h-5 text-purple-300" />
        </button>
        {chat.is_group ? (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
        ) : (
          <button onClick={() => otherUser && onOpenProfile(otherUser)}>
            <Avatar profile={otherUser} size="sm" online={otherUser?.is_online} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-white truncate">
            {chat.is_group ? chat.group?.name : otherUser?.display_name}
          </h2>
          <p className="text-xs text-purple-300/40">
            {chat.is_group ? `${chat.participants.length} members` : otherUser?.is_online ? 'Online' : `@${otherUser?.username}`}
          </p>
        </div>
        {!chat.is_group && otherUser && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onCall(otherUser.id, 'voice')}
              className="p-2 rounded-lg hover:bg-[#1a1a2e] transition-colors group"
              title="Voice call"
            >
              <Phone className="w-5 h-5 text-purple-300 group-hover:text-purple-400" />
            </button>
            <button
              onClick={() => onCall(otherUser.id, 'video')}
              className="p-2 rounded-lg hover:bg-[#1a1a2e] transition-colors group"
              title="Video call"
            >
              <Video className="w-5 h-5 text-purple-300 group-hover:text-purple-400" />
            </button>
          </div>
        )}
      </div>

      {/* Pinned message bar */}
      {pinnedMessage && (
        <div className="px-4 py-2 bg-purple-500/10 border-b border-purple-500/20 flex items-center gap-2">
          <Pin className="w-4 h-4 text-purple-400 shrink-0" />
          <p className="text-xs text-purple-200 truncate flex-1">{pinnedMessage.content}</p>
          <button onClick={() => togglePin(pinnedMessage)} className="p-1 hover:bg-purple-500/20 rounded">
            <X className="w-3 h-3 text-purple-400" />
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {loadingMore && (
          <div className="flex items-center justify-center py-2">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full gradient-purple flex items-center justify-center mb-3 neon-purple">
              {chat.is_group ? <Users className="w-8 h-8 text-white" /> : <Smile className="w-8 h-8 text-white" />}
            </div>
            <p className="text-gray-500 text-sm">No messages yet</p>
            <p className="text-gray-600 text-xs mt-1">Send the first message!</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.sender_id === profile?.id;
            const sender = chat.participants.find((p) => p.id === msg.sender_id);
            const showAvatar = !isMe && (idx === 0 || messages[idx - 1].sender_id !== msg.sender_id);
            const replyMsg = getReplyMessage(msg);
            const msgReactions = reactionsMap[msg.id] || [];
            const isEditing = editingId === msg.id;

            return (
              <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'} anim-fade-in group`}>
                {!isMe && (
                  <div className={`w-8 shrink-0 ${showAvatar ? '' : 'invisible'}`}>
                    {showAvatar && <Avatar profile={sender} size="xs" />}
                  </div>
                )}
                <div className={`max-w-[75%] sm:max-w-[60%] relative`}>
                  {/* Reply preview */}
                  {replyMsg && (
                    <div className={`mb-1 px-3 py-1.5 rounded-lg text-xs border-l-2 ${isMe ? 'border-purple-300 bg-purple-500/20' : 'border-purple-500 bg-[#1a1a2e]'} truncate`}>
                      <span className="text-purple-300 font-medium">
                        {replyMsg.sender_id === profile?.id ? 'You' : sender?.display_name}:
                      </span>{' '}
                      <span className="text-gray-400">{replyMsg.content || replyMsg.message_type}</span>
                    </div>
                  )}

                  {/* Forwarded indicator */}
                  {msg.forwarded_from && (
                    <p className={`text-[10px] text-gray-500 mb-0.5 ${isMe ? 'text-right' : 'text-left'}`}>
                      Forwarded
                    </p>
                  )}

                  {msg.message_type === 'text' && (
                    isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') editMessage(msg.id); if (e.key === 'Escape') setEditingId(null); }}
                          autoFocus
                          className="flex-1 bg-[#1a1a2e] border border-purple-500 rounded-xl px-3 py-2 text-sm text-white outline-none"
                        />
                        <button onClick={() => editMessage(msg.id)} className="p-2 gradient-purple rounded-xl">
                          <Check className="w-4 h-4 text-white" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-2 bg-[#1a1a2e] rounded-xl">
                          <X className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    ) : (
                      <div className={`px-4 py-2.5 rounded-2xl text-sm ${isMe ? 'gradient-purple text-white rounded-br-md' : 'bg-[#1a1a2e] text-gray-100 rounded-bl-md'}`}>
                        {msg.content}
                        {msg.is_edited && <span className="text-[10px] opacity-50 ml-1">edited</span>}
                      </div>
                    )
                  )}
                  {msg.message_type === 'emoji' && (
                    <div className="text-5xl px-2 py-1">{msg.content}</div>
                  )}
                  {msg.message_type === 'gif' && msg.gif_url && (
                    <img src={msg.gif_url} alt="GIF" className="rounded-2xl max-w-[240px] max-h-[200px]" />
                  )}
                  {msg.message_type === 'gift' && (
                    <div className={`px-5 py-4 rounded-2xl text-center ${isMe ? 'gradient-purple' : 'bg-[#1a1a2e]'} neon-border`}>
                      <div className="text-5xl mb-1">{msg.content.split(' ')[0]}</div>
                      <p className="text-sm font-semibold text-white">{msg.content.split(' ').slice(1).join(' ')}</p>
                      <p className="text-xs text-purple-200/60 mt-1">Gift received</p>
                    </div>
                  )}
                  {msg.message_type === 'call' && (
                    <div className={`px-4 py-3 rounded-2xl flex items-center gap-2 ${isMe ? 'gradient-purple' : 'bg-[#1a1a2e]'}`}>
                      {msg.content.includes('video') ? <Video className="w-4 h-4 text-white" /> : <Phone className="w-4 h-4 text-white" />}
                      <span className="text-sm text-white">{msg.content}</span>
                    </div>
                  )}

                  {/* Reactions */}
                  {msgReactions.length > 0 && (
                    <div className={`flex gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      {Object.entries(
                        msgReactions.reduce((acc, r) => {
                          acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)
                      ).map(([emoji, count]) => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(msg.id, emoji)}
                          className="flex items-center gap-0.5 bg-[#2a2a3e] hover:bg-purple-500/20 rounded-full px-2 py-0.5 transition-colors"
                        >
                          <span className="text-xs">{emoji}</span>
                          {count > 1 && <span className="text-[10px] text-gray-400">{count}</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <p className="text-[10px] text-gray-600">
                      {formatTime(msg.created_at)}
                      {isMe && msg.read_at && ' · Read'}
                    </p>
                    {/* Hover actions */}
                    <div className={`flex items-center gap-0.5 ${isMe ? '' : ''} opacity-0 group-hover:opacity-100 transition-opacity`}>
                      <button
                        onClick={() => setReactionPickerId(reactionPickerId === msg.id ? null : msg.id)}
                        className="p-1 hover:bg-[#1a1a2e] rounded"
                        title="React"
                      >
                        <Smile className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <button
                        onClick={() => { setReplyTo(msg); setMenuOpenId(null); }}
                        className="p-1 hover:bg-[#1a1a2e] rounded"
                        title="Reply"
                      >
                        <Reply className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <button
                        onClick={() => setForwardModal(msg)}
                        className="p-1 hover:bg-[#1a1a2e] rounded"
                        title="Forward"
                      >
                        <Forward className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      {isMe && msg.message_type === 'text' && (
                        <button
                          onClick={() => { setEditingId(msg.id); setEditText(msg.content); setMenuOpenId(null); }}
                          className="p-1 hover:bg-[#1a1a2e] rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                      )}
                      {isMe && (
                        <button
                          onClick={() => deleteMessage(msg.id)}
                          className="p-1 hover:bg-red-500/20 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-gray-500 hover:text-red-400" />
                        </button>
                      )}
                      <button
                        onClick={() => togglePin(msg)}
                        className="p-1 hover:bg-[#1a1a2e] rounded"
                        title={msg.is_pinned ? 'Unpin' : 'Pin'}
                      >
                        <Pin className={`w-3.5 h-3.5 ${msg.is_pinned ? 'text-purple-400' : 'text-gray-500'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Reaction picker */}
                  {reactionPickerId === msg.id && (
                    <div className={`absolute ${isMe ? 'right-0' : 'left-0'} -top-10 z-20 flex gap-1 bg-[#131320] rounded-full px-2 py-1 border border-[#2a2a3e] anim-scale-in`}>
                      {REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(msg.id, emoji)}
                          className="text-lg hover:scale-125 transition-transform p-0.5"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 px-2 anim-fade-in">
            <div className="flex gap-0.5">
              <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-purple-300/50">typing...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply preview bar */}
      {replyTo && (
        <div className="px-4 py-2 bg-[#1a1a2e] border-t border-[#2a2a3e] flex items-center gap-2">
          <Reply className="w-4 h-4 text-purple-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-purple-300 font-medium">Replying to {replyTo.sender_id === profile?.id ? 'yourself' : otherUser?.display_name}</p>
            <p className="text-xs text-gray-500 truncate">{replyTo.content || replyTo.message_type}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-[#2a2a3e] rounded">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      )}

      {/* Emoji picker */}
      {showEmojis && (
        <div className="border-t border-[#1a1a2e] glass-panel p-3 anim-slide-up">
          <div className="grid grid-cols-8 sm:grid-cols-10 gap-1 max-h-48 overflow-y-auto">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => sendMessage('emoji', emoji)}
                className="text-2xl hover:bg-[#1a1a2e] rounded-lg p-1.5 transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* GIF picker */}
      {showGifs && (
        <div className="border-t border-[#1a1a2e] glass-panel p-3 anim-slide-up">
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            {GIF_CATEGORIES.map((cat) => (
              <button
                key={cat.query}
                onClick={() => setGifQuery(cat.query)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  gifQuery === cat.query ? 'gradient-purple text-white' : 'bg-[#1a1a2e] text-gray-400 hover:text-purple-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto">
            {gifs.length === 0 ? (
              <div className="col-span-full flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              gifs.map((url) => (
                <button
                  key={url}
                  onClick={() => sendMessage('gif', undefined, url)}
                  className="rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
                >
                  <img src={url} alt="GIF" className="w-full h-24 object-cover" />
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Gift picker */}
      {showGifts && (
        <div className="border-t border-[#1a1a2e] glass-panel p-3 anim-slide-up">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-purple-300">Send a Gift</h3>
            <span className="text-xs text-gray-500">{gifts.length} available</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto">
            {gifts.map((gift) => (
              <button
                key={gift.id}
                onClick={() => sendGift(gift)}
                className="bg-[#1a1a2e] hover:bg-[#2a2a3e] rounded-xl p-3 text-center transition-all hover:neon-border group"
              >
                <div className="text-3xl mb-1 group-hover:scale-110 transition-transform">{gift.emoji}</div>
                <p className="text-xs font-medium text-white truncate">{gift.name}</p>
                {gift.is_nft && (
                  <span className="text-[9px] text-fuchsia-400 font-bold mt-0.5 block">NFT · {gift.rarity}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-[#1a1a2e] glass-panel safe-bottom">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowEmojis(!showEmojis); setShowGifs(false); setShowGifts(false); }}
            className={`p-2 rounded-xl transition-colors ${showEmojis ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-[#1a1a2e] text-gray-400'}`}
          >
            <Smile className="w-5 h-5" />
          </button>
          <button
            onClick={() => { setShowGifs(!showGifs); setShowEmojis(false); setShowGifts(false); }}
            className={`p-2 rounded-xl transition-colors ${showGifs ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-[#1a1a2e] text-gray-400'}`}
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => { setShowGifts(!showGifts); setShowEmojis(false); setShowGifs(false); }}
            className={`p-2 rounded-xl transition-colors ${showGifts ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-[#1a1a2e] text-gray-400'}`}
          >
            <GiftIcon className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); sendTyping(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') sendMessage('text'); }}
            placeholder="Type a message..."
            className="flex-1 bg-[#1a1a2e] border border-[#2a2a3e] rounded-full px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none transition-all"
          />
          <button
            onClick={() => sendMessage('text')}
            disabled={!input.trim()}
            className="p-2.5 gradient-purple text-white rounded-full neon-purple hover:neon-purple-strong transition-all disabled:opacity-30"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Forward modal */}
      {forwardModal && (
        <ForwardModal
          message={forwardModal}
          onClose={() => setForwardModal(null)}
          onForward={forwardMessage}
        />
      )}
    </div>
  );
}

function ForwardModal({
  message,
  onClose,
  onForward,
}: {
  message: Message;
  onClose: () => void;
  onForward: (msg: Message, chatId: string) => void;
}) {
  const { profile } = useAuth();
  const [chats, setChats] = useState<ChatWithDetails[]>([]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data: parts } = await supabase
        .from('chat_participants')
        .select('chat_id')
        .eq('user_id', profile.id);
      if (!parts || parts.length === 0) return;

      const chatIds = parts.map((p) => p.chat_id);
      const { data: chatRows } = await supabase
        .from('chats')
        .select('*')
        .in('id', chatIds)
        .order('created_at', { ascending: false });
      if (!chatRows) return;

      const enriched: ChatWithDetails[] = [];
      for (const chat of chatRows) {
        const { data: cp } = await supabase
          .from('chat_participants')
          .select('user_id')
          .eq('chat_id', chat.id);
        const otherIds = (cp || []).map((p) => p.user_id).filter((id) => id !== profile.id);
        const { data: profs } = await supabase
          .from('profiles')
          .select('*')
          .in('id', chat.is_group ? (cp || []).map((p) => p.user_id) : otherIds);
        let group = null;
        if (chat.is_group && chat.group_id) {
          const { data: g } = await supabase.from('groups').select('*').eq('id', chat.group_id).maybeSingle();
          group = g;
        }
        enriched.push({ ...chat, participants: (profs || []) as Profile[], group });
      }
      setChats(enriched);
    })();
  }, [profile]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 anim-fade-in" onClick={onClose}>
      <div className="w-full max-w-md glass-panel rounded-2xl p-6 neon-border anim-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Forward to</h3>
          <button onClick={onClose} className="p-2 hover:bg-[#1a1a2e] rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {chats.map((chat) => {
            const otherUser = chat.participants.find((p) => p.id !== profile?.id);
            return (
              <button
                key={chat.id}
                onClick={() => onForward(message, chat.id)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1a1a2e] transition-colors text-left"
              >
                {chat.is_group ? (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                ) : (
                  <Avatar profile={otherUser} size="sm" />
                )}
                <span className="text-sm font-medium text-white truncate">
                  {chat.is_group ? chat.group?.name : otherUser?.display_name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
