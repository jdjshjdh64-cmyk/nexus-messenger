import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Profile, Story } from '@/types';
import { Avatar } from '@/components/Avatar';
import { Plus, X, ChevronLeft, ChevronRight, Eye } from 'lucide-react';

interface StoriesViewProps {
  onOpenProfile: (profile: Profile) => void;
}

const STORY_COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#a855f7', '#f97316'];
const STORY_EMOJIS = ['🌟','🔥','💜','✨','🚀','🌙','⭐','💎','🎉','🌈','🌸','🦄','💫','🎊','🎯','🏆'];

interface StoryWithProfile extends Story {
  profile: Profile;
  viewed: boolean;
}

export function StoriesView({ onOpenProfile }: StoriesViewProps) {
  const { profile } = useAuth();
  const [stories, setStories] = useState<StoryWithProfile[]>([]);
  const [groupedStories, setGroupedStories] = useState<{ profile: Profile; stories: StoryWithProfile[] }[]>([]);
  const [myStories, setMyStories] = useState<Story[]>([]);
  const [viewing, setViewing] = useState<{ profile: Profile; stories: StoryWithProfile[]; index: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState('🌟');
  const [selectedColor, setSelectedEmojiColor] = useState('#8b5cf6');
  const [caption, setCaption] = useState('');

  const loadStories = useCallback(async () => {
    if (!profile) return;

    const { data: storiesData } = await supabase
      .from('stories')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (!storiesData || storiesData.length === 0) {
      setStories([]);
      setGroupedStories([]);
      setMyStories([]);
      return;
    }

    // Get unique user IDs
    const userIds = [...new Set(storiesData.map((s) => s.user_id))];

    // Fetch profiles
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .in('id', userIds);
    const profileMap = new Map((profilesData || []).map((p) => [p.id, p as Profile]));

    // Fetch views by current user
    const { data: views } = await supabase
      .from('story_views')
      .select('story_id')
      .eq('viewer_id', profile.id);
    const viewedIds = new Set((views || []).map((v) => v.story_id));

    const enriched: StoryWithProfile[] = storiesData.map((s) => ({
      ...s,
      profile: profileMap.get(s.user_id)!,
      viewed: viewedIds.has(s.id),
    }));

    setStories(enriched);
    setMyStories(enriched.filter((s) => s.user_id === profile.id));

    // Group by user
    const grouped: { profile: Profile; stories: StoryWithProfile[] }[] = [];
    for (const uid of userIds) {
      const p = profileMap.get(uid);
      if (!p) continue;
      grouped.push({ profile: p, stories: enriched.filter((s) => s.user_id === uid) });
    }
    setGroupedStories(grouped);
  }, [profile]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('stories_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => loadStories())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, loadStories]);

  const createStory = async () => {
    if (!profile) return;
    const { data } = await supabase.from('stories').insert({
      user_id: profile.id,
      emoji: selectedEmoji,
      bg_color: selectedColor,
      caption: caption.trim(),
    }).select('*').maybeSingle();

    if (data) {
      setCreating(false);
      setCaption('');
      loadStories();
    }
  };

  const viewStory = async (group: { profile: Profile; stories: StoryWithProfile[] }, startIndex: number) => {
    setViewing({ profile: group.profile, stories: group.stories, index: startIndex });

    // Mark as viewed
    for (const s of group.stories) {
      if (!s.viewed) {
        await supabase.from('story_views').insert({
          story_id: s.id,
          viewer_id: profile?.id,
        });
      }
    }
    loadStories();
  };

  const nextStory = () => {
    if (!viewing) return;
    if (viewing.index < viewing.stories.length - 1) {
      setViewing({ ...viewing, index: viewing.index + 1 });
    } else {
      const currentGroupIdx = groupedStories.findIndex((g) => g.profile.id === viewing.profile.id);
      if (currentGroupIdx < groupedStories.length - 1) {
        const nextGroup = groupedStories[currentGroupIdx + 1];
        setViewing({ profile: nextGroup.profile, stories: nextGroup.stories, index: 0 });
      } else {
        setViewing(null);
      }
    }
  };

  const prevStory = () => {
    if (!viewing) return;
    if (viewing.index > 0) {
      setViewing({ ...viewing, index: viewing.index - 1 });
    } else {
      const currentGroupIdx = groupedStories.findIndex((g) => g.profile.id === viewing.profile.id);
      if (currentGroupIdx > 0) {
        const prevGroup = groupedStories[currentGroupIdx - 1];
        setViewing({ ...prevGroup, index: prevGroup.stories.length - 1 });
      }
    }
  };

  // Story viewer
  if (viewing) {
    const story = viewing.stories[viewing.index];
    const progress = ((viewing.index + 1) / viewing.stories.length) * 100;

    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center anim-fade-in">
        <div className="relative w-full max-w-md h-full sm:h-[90vh] sm:rounded-2xl overflow-hidden flex flex-col"
          style={{ background: story.bg_color }}>
          {/* Progress bars */}
          <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 p-3">
            {viewing.stories.map((_, i) => (
              <div key={i} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                <div className={`h-full bg-white rounded-full transition-all ${i <= viewing.index ? 'w-full' : 'w-0'}`}
                  style={{ transition: i === viewing.index ? 'width 5s linear' : 'none' }} />
              </div>
            ))}
          </div>

          {/* Header */}
          <div className="absolute top-6 left-0 right-0 z-20 flex items-center gap-3 p-3">
            <Avatar profile={viewing.profile} size="sm" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">{viewing.profile.display_name}</p>
              <p className="text-xs text-white/60">@{viewing.profile.username}</p>
            </div>
            <button onClick={() => setViewing(null)} className="p-2">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 flex items-center justify-center relative">
            {story.emoji && (
              <div className="text-8xl mb-4 anim-scale-in">{story.emoji}</div>
            )}
            {story.caption && (
              <div className="absolute bottom-20 left-0 right-0 text-center px-8">
                <p className="text-xl text-white font-medium" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                  {story.caption}
                </p>
              </div>
            )}
          </div>

          {/* Nav */}
          <button onClick={prevStory} className="absolute left-0 top-0 bottom-0 w-1/3 z-10 flex items-center justify-start p-2">
            {viewing.index > 0 && <ChevronLeft className="w-6 h-6 text-white/50" />}
          </button>
          <button onClick={nextStory} className="absolute right-0 top-0 bottom-0 w-1/3 z-10 flex items-center justify-end p-2">
            <ChevronRight className="w-6 h-6 text-white/50" />
          </button>

          {story.user_id === profile?.id && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-black/40 rounded-full px-4 py-2">
              <Eye className="w-4 h-4 text-white" />
              <span className="text-sm text-white">Your story</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Story creator
  if (creating) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 anim-fade-in">
        <div className="w-full max-w-md glass-panel rounded-2xl p-6 neon-border anim-scale-in">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Create Story</h2>
            <button onClick={() => setCreating(false)} className="p-2 hover:bg-[#1a1a2e] rounded-lg">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Preview */}
          <div className="w-full h-64 rounded-xl flex items-center justify-center mb-4 relative overflow-hidden"
            style={{ background: selectedColor }}>
            <div className="text-7xl">{selectedEmoji}</div>
            {caption && (
              <p className="absolute bottom-4 left-0 right-0 text-center text-white text-lg font-medium px-4">
                {caption}
              </p>
            )}
          </div>

          {/* Emoji picker */}
          <p className="text-xs text-purple-300/60 mb-2 font-medium">CHOOSE EMOJI</p>
          <div className="grid grid-cols-8 gap-1 mb-4">
            {STORY_EMOJIS.map((e) => (
              <button key={e} onClick={() => setSelectedEmoji(e)}
                className={`text-2xl p-1.5 rounded-lg transition-all ${selectedEmoji === e ? 'bg-purple-500/30 scale-110' : 'hover:bg-[#1a1a2e]'}`}>
                {e}
              </button>
            ))}
          </div>

          {/* Color picker */}
          <p className="text-xs text-purple-300/60 mb-2 font-medium">BACKGROUND</p>
          <div className="flex gap-2 mb-4">
            {STORY_COLORS.map((c) => (
              <button key={c} onClick={() => setSelectedEmojiColor(c)}
                className={`w-8 h-8 rounded-full transition-all ${selectedColor === c ? 'ring-2 ring-white scale-110' : ''}`}
                style={{ background: c }} />
            ))}
          </div>

          {/* Caption */}
          <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a caption..."
            className="w-full bg-[#0a0a0f]/60 border border-[#2a2a3e] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-purple-500 outline-none mb-4" />

          <button onClick={createStory}
            className="w-full gradient-purple text-white font-semibold py-3 rounded-xl neon-purple hover:neon-purple-strong transition-all">
            Post Story
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0f] p-4">
      <h2 className="text-2xl font-bold neon-text mb-6">Stories</h2>

      {/* Story bar */}
      <div className="flex gap-4 overflow-x-auto pb-4 mb-6">
        {/* My story / Add */}
        <button onClick={() => myStories.length > 0 ? viewStory({ profile: profile!, stories: stories.filter(s => s.user_id === profile?.id) }, 0) : setCreating(true)}
          className="flex flex-col items-center gap-2 shrink-0">
          <div className="relative">
            <Avatar profile={profile} size="lg" ring={myStories.length > 0} />
            {myStories.length === 0 && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 gradient-purple rounded-full flex items-center justify-center border-2 border-[#0a0a0f]">
                <Plus className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
          <span className="text-xs text-purple-300 font-medium">{myStories.length > 0 ? 'Your story' : 'Add story'}</span>
        </button>

        {/* Other stories */}
        {groupedStories.filter((g) => g.profile.id !== profile?.id).map((group) => (
          <button key={group.profile.id}
            onClick={() => viewStory(group, 0)}
            onDoubleClick={() => onOpenProfile(group.profile)}
            className="flex flex-col items-center gap-2 shrink-0">
            <Avatar profile={group.profile} size="lg" ring={!group.stories[0].viewed} />
            <span className="text-xs text-gray-300 font-medium truncate max-w-[64px]">{group.profile.display_name.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {groupedStories.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full gradient-purple flex items-center justify-center mb-4 neon-purple">
            <Plus className="w-10 h-10 text-white" />
          </div>
          <p className="text-gray-400 text-sm">No stories yet</p>
          <p className="text-gray-600 text-xs mt-1 mb-4">Be the first to share!</p>
          <button onClick={() => setCreating(true)}
            className="gradient-purple text-white px-6 py-2.5 rounded-xl text-sm font-semibold neon-purple">
            Create Story
          </button>
        </div>
      )}
    </div>
  );
}
