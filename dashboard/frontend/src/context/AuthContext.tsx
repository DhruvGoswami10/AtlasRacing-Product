import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase from '../lib/supabaseClient';

export interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  subscription_tier: string | null;
  download_access: boolean | null;
  app_version_access: string[] | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  rememberMe: boolean;
  setRememberMe: (value: boolean) => void;
  signInWithPassword: (email: string, password: string) => Promise<{ error?: string }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const REMEMBER_ME_KEY = 'atlas-remember-me';

async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[Auth] Failed to load profile:', error.message);
    return null;
  }

  return (data as UserProfile | null) ?? null;
}

async function upsertProfile(user: User): Promise<void> {
  const candidateUsername =
    (user.user_metadata?.username as string | undefined) ??
    user.email?.split('@')[0] ??
    null;

  const { error } = await supabase.from('user_profiles').upsert(
    {
      id: user.id,
      email: user.email,
      username: candidateUsername
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.warn('[Auth] Failed to upsert profile:', error.message);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [rememberMe, setRememberMeState] = useState<boolean>(() => {
    const stored = localStorage.getItem(REMEMBER_ME_KEY);
    if (stored === null) return true;
    return stored === 'true';
  });

  useEffect(() => {
    localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? 'true' : 'false');
  }, [rememberMe]);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async (nextUser: User) => {
      if (!isMounted) {
        return;
      }

      try {
        await upsertProfile(nextUser);
        const loadedProfile = await fetchUserProfile(nextUser.id);
        if (isMounted) {
          setProfile(loadedProfile);
        }
      } catch (profileError) {
        console.warn('[Auth] Profile load failed', profileError);
        if (isMounted) {
          setProfile(null);
        }
      }
    };

    const applySession = (nextSession: Session | null) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        setProfile((current) => current ?? null);
        void loadProfile(nextSession.user);
      } else {
        setProfile(null);
      }
    };

    const initialise = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) return;

        applySession(data.session ?? null);
      } catch (error) {
        console.warn('[Auth] Failed to fetch session', error);
        if (isMounted) {
          applySession(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initialise();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return;

      applySession(newSession ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const setRememberMe = useCallback((value: boolean) => {
    setRememberMeState(value);
  }, []);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        try {
          await upsertProfile(data.user);
          setProfile(await fetchUserProfile(data.user.id));
        } catch (profileError) {
          console.warn('[Auth] Failed to refresh profile after password sign-in', profileError);
        }
      }

      return {};
    },
    []
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: 'https://yligdiorizqcapugvqph.supabase.co/auth/v1/callback'
        }
      });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        try {
          await upsertProfile(data.user);
          setProfile(await fetchUserProfile(data.user.id));
        } catch (profileError) {
          console.warn('[Auth] Failed to refresh profile after sign-up', profileError);
        }
      }

      return {};
    },
    []
  );

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://yligdiorizqcapugvqph.supabase.co/auth/v1/callback',
        scopes: 'profile email'
      }
    });

    if (error) {
      return { error: error.message };
    }

    return {};
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();

    if (!rememberMe) {
      try {
        localStorage.removeItem('supabase.auth.token');
        sessionStorage.removeItem('supabase.auth.token');
      } catch (error) {
        console.warn('[Auth] Failed to clear session storage', error);
      }
    }
  }, [rememberMe]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      loading,
      rememberMe,
      setRememberMe,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      signOut
    }),
    [
      user,
      session,
      profile,
      loading,
      rememberMe,
      setRememberMe,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      signOut
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
