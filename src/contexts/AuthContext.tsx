import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

type AppRole = 'admin' | 'sdr' | 'gerente' | 'motorista';

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isSDR: boolean;
  isGerente: boolean;
  isMotorista: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string, userEmail?: string, userFullName?: string) => {
    try {
      // Fetch profile
      let { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      // Auto-provision profile if it doesn't exist
      if (!profileData && !profileError) {
        const email = userEmail || '';
        const fullName = userFullName || email;
        const { data: newProfile, error: insertProfileError } = await supabase
          .from('profiles')
          .upsert({ user_id: userId, email, full_name: fullName }, { onConflict: 'user_id' })
          .select('*')
          .single();
        if (!insertProfileError) {
          profileData = newProfile;
        } else {
          // Profile may have been created by trigger — try to fetch again
          const { data: retryProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();
          profileData = retryProfile;
        }
      }

      if (profileData) {
        setProfile(profileData);
      }

      // Fetch role — order by priority: admin > gerente > sdr > motorista
      const roleOrder: AppRole[] = ['admin', 'gerente', 'sdr', 'motorista'];
      let { data: rolesData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      let roleData: { role: AppRole } | null = null;
      if (rolesData && rolesData.length > 0) {
        // Pick highest-priority role
        for (const r of roleOrder) {
          const found = rolesData.find(rd => rd.role === r);
          if (found) { roleData = found as { role: AppRole }; break; }
        }
        if (!roleData) roleData = rolesData[0] as { role: AppRole };
      }

      // Auto-provision role if it doesn't exist
      if (!roleData) {
        const { count } = await supabase
          .from('user_roles')
          .select('id', { count: 'exact', head: true });
        const assignedRole: AppRole = (count === 0 || count === null) ? 'admin' : 'sdr';
        const { data: newRole } = await supabase
          .from('user_roles')
          .upsert({ user_id: userId, role: assignedRole }, { onConflict: 'user_id,role' })
          .select('role')
          .single();
        if (newRole) roleData = newRole as { role: AppRole };
      }

      if (roleData) {
        setRole(roleData.role as AppRole);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  useEffect(() => {
    let initialized = false;

    // THEN check for existing session first (synchronous)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user && !initialized) {
        initialized = true;
        fetchUserData(
          session.user.id,
          session.user.email,
          session.user.user_metadata?.full_name
        );
      }
      setLoading(false);
    });

    // Set up auth state listener for future changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Only fetch if this is a new login event or first initialization
          if (!initialized || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            if (!initialized) initialized = true;
            // Defer data fetch to avoid deadlock
            setTimeout(() => {
              fetchUserData(
                session.user.id,
                session.user.email,
                session.user.user_metadata?.full_name
              );
            }, 0);
          }
        } else {
          initialized = false;
          setProfile(null);
          setRole(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName }
      }
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
  };

  const value = {
    user,
    session,
    profile,
    role,
    loading,
    signIn,
    signUp,
    signOut,
    isAdmin: role === 'admin',
    isSDR: role === 'sdr',
    isGerente: role === 'gerente',
    isMotorista: role === 'motorista',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
