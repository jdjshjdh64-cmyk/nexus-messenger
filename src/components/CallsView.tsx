import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Profile, Call } from '@/types';
import { Avatar } from '@/components/Avatar';
import { Phone, Video, PhoneOff, VideoOff, PhoneIncoming, PhoneOutgoing, PhoneMissed } from 'lucide-react';

interface CallsViewProps {
  onOpenProfile: (profile: Profile) => void;
  onCall: (receiverId: string, callType: 'voice' | 'video') => void;
}

export function CallsView({ onOpenProfile, onCall }: CallsViewProps) {
  const { profile } = useAuth();
  const [calls, setCalls] = useState<(Call & { caller: Profile; receiver: Profile })[]>([]);

  const loadCalls = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('calls')
      .select(`*, caller:caller_id(*), receiver:receiver_id(*)`)
      .or(`caller_id.eq.${profile.id},receiver_id.eq.${profile.id}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) setCalls(data as any);
  }, [profile]);

  useEffect(() => {
    loadCalls();
  }, [loadCalls]);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0f] p-4">
      <div className="flex items-center gap-2 mb-6">
        <Phone className="w-7 h-7 text-purple-400" />
        <h2 className="text-2xl font-bold neon-text">Calls</h2>
      </div>

      {calls.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-[#131320] flex items-center justify-center mb-4 border border-[#2a2a3e]">
            <PhoneOff className="w-10 h-10 text-purple-500/40" />
          </div>
          <p className="text-gray-400 text-sm">No calls yet</p>
          <p className="text-gray-600 text-xs mt-1">Start a call from any chat</p>
        </div>
      ) : (
        <div className="space-y-2">
          {calls.map((call) => {
            const isOutgoing = call.caller_id === profile?.id;
            const otherUser = isOutgoing ? call.receiver : call.caller;
            const isVideo = call.call_type === 'video';
            const isMissed = call.status === 'missed';
            const isDeclined = call.status === 'declined';

            return (
              <div key={call.id} className="flex items-center gap-3 bg-[#131320] rounded-xl p-3 border border-[#1a1a2e] hover:border-purple-500/30 transition-all">
                <button onClick={() => onOpenProfile(otherUser)}>
                  <Avatar profile={otherUser} size="md" />
                </button>
                <div className="flex-1 min-w-0">
                  <button onClick={() => onOpenProfile(otherUser)} className="text-left">
                    <p className="text-sm font-medium text-white hover:text-purple-300 transition-colors">{otherUser?.display_name}</p>
                  </button>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {isMissed ? (
                      <PhoneMissed className="w-3.5 h-3.5 text-red-400" />
                    ) : isOutgoing ? (
                      <PhoneOutgoing className="w-3.5 h-3.5 text-purple-400" />
                    ) : (
                      <PhoneIncoming className="w-3.5 h-3.5 text-green-400" />
                    )}
                    <span className={`text-xs ${isMissed ? 'text-red-400' : 'text-gray-500'}`}>
                      {isMissed ? 'Missed' : isDeclined ? 'Declined' : isOutgoing ? 'Outgoing' : 'Incoming'}
                      {isVideo && ' video'}
                      {call.duration_seconds > 0 && ` · ${formatDuration(call.duration_seconds)}`}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-600 mt-0.5">
                    {new Date(call.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <button onClick={() => onCall(otherUser.id, call.call_type)}
                  className="p-2.5 rounded-xl bg-[#1a1a2e] hover:gradient-purple transition-all group">
                  {isVideo ? (
                    <Video className="w-5 h-5 text-purple-300 group-hover:text-white" />
                  ) : (
                    <Phone className="w-5 h-5 text-purple-300 group-hover:text-white" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
