import { createContext, useContext, useMemo } from 'react';

export interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  subscription_tier: string | null;
  download_access: boolean | null;
  app_version_access: string[] | null;
}

interface AuthContextValue {
  user: { id: string; email: string };
  session: { user: { id: string; email: string } };
  profile: UserProfile;
  loading: false;
}

const standaloneUser = {
  id: 'standalone-user',
  email: 'driver@atlasracing.local',
};

const standaloneProfile: UserProfile = {
  id: 'standalone-user',
  email: 'driver@atlasracing.local',
  username: 'Driver',
  subscription_tier: null,
  download_access: true,
  app_version_access: null,
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<AuthContextValue>(
    () => ({
      user: standaloneUser,
      session: { user: standaloneUser },
      profile: standaloneProfile,
      loading: false as const,
    }),
    []
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
