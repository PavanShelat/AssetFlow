import { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('assetflow_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [session, setSession] = useState(() => {
    const stored = localStorage.getItem('assetflow_session');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verify current session on mount
    if (session?.access_token) {
      authService.me()
        .then((res) => {
          setUser(res.data.user);
          localStorage.setItem('assetflow_user', JSON.stringify(res.data.user));
        })
        .catch(() => {
          // Token invalid, clear session
          logout();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await authService.login({ email, password });
    const { user: userData, session: sessionData } = res.data;
    setUser(userData);
    setSession(sessionData);
    localStorage.setItem('assetflow_user', JSON.stringify(userData));
    localStorage.setItem('assetflow_session', JSON.stringify(sessionData));
    return userData;
  };

  const signup = async (email, password, full_name) => {
    const res = await authService.signup({ email, password, full_name });
    const { user: userData, session: sessionData } = res.data;
    if (sessionData) {
      setUser(userData);
      setSession(sessionData);
      localStorage.setItem('assetflow_user', JSON.stringify(userData));
      localStorage.setItem('assetflow_session', JSON.stringify(sessionData));
    }
    return res.data;
  };

  const logout = () => {
    setUser(null);
    setSession(null);
    localStorage.removeItem('assetflow_user');
    localStorage.removeItem('assetflow_session');
  };

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'asset_manager';
  const isDeptHead = user?.role === 'department_head';
  const canManageAssets = isAdmin || isManager;
  const canApprove = isAdmin || isManager || isDeptHead;

  return (
    <AuthContext.Provider value={{
      user, session, loading,
      login, signup, logout,
      isAdmin, isManager, isDeptHead,
      canManageAssets, canApprove,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
