import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { normalizeClientRole, type ClientRole } from '../lib/permissions';

interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: ClientRole;
  employeeId?: string | null;
  phone?: string;
  photoUrl?: string;
}

interface AuthContextType {
  user: { uid: string, email: string, role?: string, employeeId?: string | null, exp?: number } | null;
  profile: UserProfile | null;
  loading: boolean;
  loginState: (email: string, password?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function buildSessionProfile(authenticatedUser: { uid: string; email: string; role?: string; employeeId?: string | null }): UserProfile {
  const email = authenticatedUser.email || '';
  const localPart = email.split('@')[0] || 'User';
  const role = normalizeClientRole(authenticatedUser.role) || 'client';
  const readableName = localPart.replace(/[._-]+/g, ' ').trim();
  const [firstName = readableName || 'User', ...lastParts] = readableName.split(/\s+/).filter(Boolean);

  return {
    id: authenticatedUser.uid,
    email,
    firstName,
    lastName: lastParts.join(' '),
    role,
    employeeId: authenticatedUser.employeeId || null,
    photoUrl: '',
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ uid: string, email: string, role?: string, employeeId?: string | null, exp?: number } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAndScheduleWarning = (exp?: number) => {
    if (!exp) return;
    const now = Math.floor(Date.now() / 1000);
    const timeUntilWarning = (exp - 300) - now;
    
    if (timeUntilWarning > 0) {
      setTimeout(() => {
        toast('Your session will expire in 5 minutes', {
          duration: 30000,
          action: {
            label: 'Keep me signed in',
            onClick: async () => {
              try {
                const res = await fetch('/api/auth/refresh', { method: 'POST' });
                if (res.ok) {
                  const data = await res.json();
                  setUser(data.user);
                  setProfile(buildSessionProfile(data.user));
                  checkAndScheduleWarning(data.user.exp);
                  toast.success('Session refreshed successfully');
                }
              } catch (e) {
                console.error(e);
              }
            }
          }
        });
      }, timeUntilWarning * 1000);
    }
  };

  const loadProfile = async (authenticatedUser: { uid: string; email: string; role?: string; employeeId?: string | null }) => {
    setProfile(buildSessionProfile(authenticatedUser));
  };

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
           const resData = await response.json();
           setUser({ ...resData.user, exp: resData.exp });
           checkAndScheduleWarning(resData.exp);
           await loadProfile(resData.user);
        } else {
           setUser(null);
           setProfile(null);
        }
      } catch (e) {
        console.error("Auth init error", e);
      } finally {
        setLoading(false);
      }
    };
    initializeAuth();
  }, []);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
           const resData = await response.json();
           setUser({ ...resData.user, exp: resData.exp });
           checkAndScheduleWarning(resData.exp);
           await loadProfile(resData.user);
           window.location.href = '/';
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const signInWithGoogle = async () => {
    try {
      const redirectUri = `${window.location.origin}/api/auth/google/callback`;
      const response = await fetch(`/api/auth/google/url?redirect_uri=${encodeURIComponent(redirectUri)}`);
      
      if (!response.ok) throw new Error('Failed to get auth URL');
      const { url } = await response.json();

      const authWindow = window.open(
        url,
        'oauth_popup',
        'width=600,height=700'
      );

      if (!authWindow) {
        toast.error('Please allow popups for this site to connect your account.');
      }
    } catch (error: any) {
      toast.error('Google OAuth failed: ' + error.message);
    }
  };

  const loginState = async (email: string, password?: string) => {
    const res = await fetch('/api/auth/login', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
       throw new Error(data.error || 'Failed to login');
    }
    
    setUser(data.user);
    await loadProfile(data.user);
    
    let targetPath = '/';
    const loginRole = normalizeClientRole(data.user.role);
    if (loginRole === 'admin' || loginRole === 'super_admin' || loginRole === 'manager') targetPath = '/';
    else if (loginRole === 'reception' || loginRole === 'cashier') targetPath = '/scanner';
    else if (loginRole === 'trainer') targetPath = '/classes';
    else if (loginRole === 'hr') targetPath = '/hr';
    else if (loginRole === 'accounting') targetPath = '/accounting';
    else if (loginRole === 'warehouse_manager') targetPath = '/warehouse';
    
    window.location.href = targetPath;
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setProfile(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, loginState, signInWithGoogle, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
