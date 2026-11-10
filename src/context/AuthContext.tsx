import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, username: string, displayName: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // Tracks the most recent loadProfile request so a stale async result
  // can't overwrite a newer, valid profile.
  const profileLoadIdRef = useRef(0);
  // Set to true during signUp so onAuthStateChange doesn't race with us —
  // it fires when auth.signUp() completes, but the profile row doesn't exist
  // yet. signUp handles loadProfile and setLoading explicitly after insert.
  const isSigningUpRef = useRef(false);

  const loadProfile = useCallback(async (userId: string) => {
    const loadId = ++profileLoadIdRef.current;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error loading profile:', error);
      return;
    }

    // Only apply the result if no newer loadProfile call has started.
    if (loadId === profileLoadIdRef.current) {
      setProfile((data as Profile) ?? null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await loadProfile(user.id);
    }
  }, [user, loadProfile]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
        // During signUp, the profile row doesn't exist yet — signUp handles
        // loadProfile and setLoading itself after inserting the profile.
        if (isSigningUpRef.current) return;
        if (session?.user) {
          await loadProfile(session.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signUp = async (email: string, password: string, username: string, displayName: string) => {
    // Suppress onAuthStateChange so it doesn't set loading=false or
    // loadProfile (which would find no row yet) before we insert the profile.
    isSigningUpRef.current = true;
    setLoading(true);

    // Check username uniqueness BEFORE creating the auth account
    // to avoid orphaned auth users with no profile.
    const { data: existing, error: checkError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (checkError) {
      isSigningUpRef.current = false;
      setLoading(false);
      return { error: checkError.message };
    }

    if (existing) {
      isSigningUpRef.current = false;
      setLoading(false);
      return { error: 'Username already taken' };
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      isSigningUpRef.current = false;
      setLoading(false);
      return { error: error.message };
    }
    if (!data.user) {
      isSigningUpRef.current = false;
      setLoading(false);
      return { error: 'Sign up failed. Please try again.' };
    }

    // Check if this is the first user (will become owner and admin).
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    const isFirstUser = count === 0;

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      username,
      display_name: displayName,
      is_owner: isFirstUser,
      is_admin: isFirstUser,
    });

    if (profileError) {
      // Profile insert failed — the auth user is orphaned. Sign out and
      // let onAuthStateChange clean up state (ref is now false).
      isSigningUpRef.current = false;
      await supabase.auth.signOut();
      setProfile(null);
      setSession(null);
      setUser(null);
      setLoading(false);
      return { error: profileError.code === '23505' ? 'Username already taken' : profileError.message };
    }

    // Profile row is now in the database — load it into state.
    // This is the only loadProfile call during signUp (onAuthStateChange
    // was suppressed), so the profileLoadIdRef guard is not even needed
    // here, but loadProfile applies it internally as a safety net.
    await loadProfile(data.user.id);

    // Re-enable onAuthStateChange for future events, then set loading false.
    isSigningUpRef.current = false;
    setLoading(false);

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      return { error: error.message };
    }
    // onAuthStateChange will fire, load the profile, and set loading=false.
    return { error: null };
  };

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    setUser(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signUp, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
