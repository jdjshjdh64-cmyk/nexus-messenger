import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Profile, Call, CallSignal } from '@/types';
import { Avatar } from '@/components/Avatar';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Volume2 } from 'lucide-react';

interface CallModalProps {
  receiverId: string;
  callType: 'voice' | 'video';
  isIncoming?: boolean;
  callId?: string;
  onClose: () => void;
}

type CallState = 'ringing' | 'connecting' | 'active' | 'ended';

export function CallModal({ receiverId, callType, isIncoming, callId: incomingCallId, onClose }: CallModalProps) {
  const { profile } = useAuth();
  const [receiver, setReceiver] = useState<Profile | null>(null);
  const [callState, setCallState] = useState<CallState>('ringing');
  const [callId, setCallId] = useState<string>(incomingCallId || '');
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [duration, setDuration] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', receiverId).maybeSingle().then(({ data }) => {
      if (data) setReceiver(data as Profile);
    });
  }, [receiverId]);

  const endCall = useCallback(async () => {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    if (callId) {
      const dur = startTimeRef.current ? Math.floor((Date.now() - startTimeRef.current) / 1000) : 0;
      await supabase.from('calls').update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        duration_seconds: dur,
      }).eq('id', callId);

      await supabase.from('call_signaling').insert({
        call_id: callId,
        sender_id: profile?.id,
        receiver_id: receiverId,
        signal_type: 'end',
        signal_data: 'ended',
      });
    }

    setCallState('ended');
    setTimeout(onClose, 500);
  }, [callId, profile, receiverId, onClose]);

  const setupPeerConnection = useCallback(async () => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnectionRef.current = pc;

    pc.onicecandidate = async (event) => {
      if (event.candidate && callId) {
        await supabase.from('call_signaling').insert({
          call_id: callId,
          sender_id: profile?.id,
          receiver_id: receiverId,
          signal_type: 'ice',
          signal_data: JSON.stringify(event.candidate),
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
      setCallState('active');
      startTimeRef.current = Date.now();
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      durationTimerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    };

    // Get local media
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    } catch (err) {
      // Fallback: audio only
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = audioStream;
        audioStream.getTracks().forEach((track) => pc.addTrack(track, audioStream));
      } catch {
        setCallState('ended');
        setTimeout(onClose, 500);
        return;
      }
    }

    return pc;
  }, [callId, profile, receiverId, callType, onClose]);

  const createOffer = useCallback(async () => {
    const pc = await setupPeerConnection();
    if (!pc) return;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const { data: callRow } = await supabase.from('calls').insert({
      caller_id: profile?.id,
      receiver_id: receiverId,
      call_type: callType,
      status: 'ringing',
    }).select('*').maybeSingle();

    if (callRow) {
      setCallId((callRow as Call).id);
      await supabase.from('call_signaling').insert({
        call_id: (callRow as Call).id,
        sender_id: profile?.id,
        receiver_id: receiverId,
        signal_type: 'offer',
        signal_data: JSON.stringify(offer),
      });

      await supabase.from('notifications').insert({
        user_id: receiverId,
        type: 'call',
        title: profile?.display_name || 'Unknown',
        body: `Incoming ${callType} call`,
        from_user_id: profile?.id,
      });
    }
  }, [setupPeerConnection, profile, receiverId, callType]);

  const acceptCall = useCallback(async () => {
    if (!incomingCallId) return;
    setCallId(incomingCallId);
    setCallState('connecting');

    await supabase.from('calls').update({
      status: 'accepted',
      started_at: new Date().toISOString(),
    }).eq('id', incomingCallId);

    const pc = await setupPeerConnection();
    if (!pc) return;

    // We need the offer — fetch it
    const { data: signals } = await supabase
      .from('call_signaling')
      .select('*')
      .eq('call_id', incomingCallId)
      .eq('signal_type', 'offer')
      .order('created_at', { ascending: false })
      .limit(1);

    if (signals && signals.length > 0) {
      const offer = JSON.parse((signals[0] as CallSignal).signal_data);
      await pc.setRemoteDescription(offer);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await supabase.from('call_signaling').insert({
        call_id: incomingCallId,
        sender_id: profile?.id,
        receiver_id: receiverId,
        signal_type: 'answer',
        signal_data: JSON.stringify(answer),
      });
    }
  }, [incomingCallId, profile, receiverId, setupPeerConnection]);

  const declineCall = useCallback(async () => {
    if (incomingCallId) {
      await supabase.from('calls').update({ status: 'declined' }).eq('id', incomingCallId);
      await supabase.from('call_signaling').insert({
        call_id: incomingCallId,
        sender_id: profile?.id,
        receiver_id: receiverId,
        signal_type: 'reject',
        signal_data: 'declined',
      });
    }
    setCallState('ended');
    setTimeout(onClose, 500);
  }, [incomingCallId, profile, receiverId, onClose]);

  // Initiate call (outgoing)
  useEffect(() => {
    if (!isIncoming && !callId) {
      createOffer();
      setCallState('ringing');
    }
  }, [isIncoming, callId, createOffer]);

  // Listen for signals
  useEffect(() => {
    if (!callId || !profile) return;

    const channel = supabase
      .channel(`call_${callId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'call_signaling',
        filter: `call_id=eq.${callId}`,
      }, async (payload) => {
        const signal = payload.new as CallSignal;
        if (signal.sender_id === profile.id) return; // Ignore own signals

        const pc = peerConnectionRef.current;
        if (!pc) return;

        if (signal.signal_type === 'answer') {
          const answer = JSON.parse(signal.signal_data);
          await pc.setRemoteDescription(answer);
          setCallState('connecting');
          await supabase.from('calls').update({ status: 'accepted', started_at: new Date().toISOString() }).eq('id', callId);
        } else if (signal.signal_type === 'ice') {
          try {
            const candidate = JSON.parse(signal.signal_data);
            await pc.addIceCandidate(candidate);
          } catch (e) { /* ignore */ }
        } else if (signal.signal_type === 'reject') {
          setCallState('ended');
          setTimeout(onClose, 500);
        } else if (signal.signal_type === 'end') {
          setCallState('ended');
          setTimeout(onClose, 500);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [callId, profile, onClose]);

  // For incoming calls: process ICE candidates after remote description is set
  useEffect(() => {
    if (!isIncoming || !callId || !profile) return;

    const fetchIce = async () => {
      const { data: iceSignals } = await supabase
        .from('call_signaling')
        .select('*')
        .eq('call_id', callId)
        .eq('signal_type', 'ice')
        .eq('sender_id', receiverId)
        .order('created_at', { ascending: true });

      if (iceSignals && peerConnectionRef.current?.remoteDescription) {
        for (const s of iceSignals) {
          try {
            await peerConnectionRef.current.addIceCandidate(JSON.parse((s as CallSignal).signal_data));
          } catch (e) { /* ignore */ }
        }
      }
    };
    const t = setTimeout(fetchIce, 2000);
    return () => clearTimeout(t);
  }, [isIncoming, callId, profile, receiverId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      if (peerConnectionRef.current) peerConnectionRef.current.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = muted; });
      setMuted(!muted);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = videoOff; });
      setVideoOff(!videoOff);
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0f] flex flex-col items-center justify-center anim-fade-in">
      {/* Background gradient */}
      <div className="absolute inset-0 gradient-purple-radial" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse" />

      {/* Remote video */}
      {callType === 'video' && (
        <video ref={remoteVideoRef} autoPlay playsInline
          className={`absolute inset-0 w-full h-full object-cover ${callState === 'active' ? 'opacity-100' : 'opacity-0'}`} />
      )}

      {/* Local video */}
      {callType === 'video' && (
        <video ref={localVideoRef} autoPlay playsInline muted
          className={`absolute top-20 right-4 w-32 h-48 object-cover rounded-2xl border border-purple-500/30 z-10 ${videoOff ? 'opacity-0' : 'opacity-100'}`} />
      )}

      <div className="relative z-10 flex flex-col items-center">
        <Avatar profile={receiver} size="xl" ring={callState === 'ringing'} />
        <h2 className="text-2xl font-bold text-white mt-4">{receiver?.display_name}</h2>
        <p className="text-purple-300/60 text-sm mt-1">
          {callState === 'ringing' && (isIncoming ? 'Incoming call...' : 'Ringing...')}
          {callState === 'connecting' && 'Connecting...'}
          {callState === 'active' && formatDuration(duration)}
          {callState === 'ended' && 'Call ended'}
        </p>

        {callState === 'ringing' && isIncoming ? (
          <div className="flex items-center gap-6 mt-10">
            <button onClick={declineCall}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all anim-pulse-glow">
              <PhoneOff className="w-7 h-7 text-white" />
            </button>
            <button onClick={acceptCall}
              className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all anim-pulse-glow">
              {callType === 'video' ? <Video className="w-7 h-7 text-white" /> : <Phone className="w-7 h-7 text-white" />}
            </button>
          </div>
        ) : callState === 'active' ? (
          <div className="flex items-center gap-4 mt-10">
            <button onClick={toggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${muted ? 'bg-red-500' : 'bg-[#1a1a2e] hover:bg-[#2a2a3e]'}`}>
              {muted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
            </button>
            {callType === 'video' && (
              <button onClick={toggleVideo}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${videoOff ? 'bg-red-500' : 'bg-[#1a1a2e] hover:bg-[#2a2a3e]'}`}>
                {videoOff ? <VideoOff className="w-6 h-6 text-white" /> : <Video className="w-6 h-6 text-white" />}
              </button>
            )}
            <button onClick={endCall}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all">
              <PhoneOff className="w-7 h-7 text-white" />
            </button>
          </div>
        ) : (
          <button onClick={endCall}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all mt-10">
            <PhoneOff className="w-7 h-7 text-white" />
          </button>
        )}
      </div>
    </div>
  );
}
