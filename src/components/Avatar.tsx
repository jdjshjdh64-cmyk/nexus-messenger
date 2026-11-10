import { Profile } from '@/types';

interface AvatarProps {
  profile: Profile | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  ring?: boolean;
  online?: boolean;
}

const sizeMap = {
  xs: 'w-8 h-8 text-xs',
  sm: 'w-10 h-10 text-sm',
  md: 'w-12 h-12 text-base',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-24 h-24 text-3xl',
};

const dotSize = {
  xs: 'w-2 h-2',
  sm: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
  lg: 'w-3.5 h-3.5',
  xl: 'w-5 h-5',
};

export function Avatar({ profile, size = 'md', ring, online }: AvatarProps) {
  const initials = profile?.display_name?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <div className={`relative shrink-0 ${ring ? 'p-0.5 gradient-purple rounded-full' : ''}`}>
      <div
        className={`${sizeMap[size]} ${ring ? 'ring-2 ring-[#0a0a0f]' : ''} rounded-full flex items-center justify-center font-semibold text-white overflow-hidden`}
        style={!profile?.avatar_url ? { background: 'linear-gradient(135deg, #7c3aed, #a855f7)' } : {}}
      >
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>
      {online && (
        <div className={`absolute bottom-0 right-0 ${dotSize[size]} bg-green-400 rounded-full border-2 border-[#0a0a0f]`} />
      )}
    </div>
  );
}
