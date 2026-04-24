import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('reviewsense_token'));
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    const stored = localStorage.getItem('reviewsense_token');
    const cachedUser = localStorage.getItem('reviewsense_user');
    if (!stored) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    setToken(stored);
    if (cachedUser) {
      try {
        setUser(JSON.parse(cachedUser));
      } catch {
        setUser(null);
      }
    }
    try {
      const { data } = await api.get('/api/auth/me');
      if (data.success && data.data?.user) {
        setUser(data.data.user);
        localStorage.setItem('reviewsense_user', JSON.stringify(data.data.user));
      }
    } catch {
      setUser(null);
      localStorage.removeItem('reviewsense_token');
      localStorage.removeItem('reviewsense_user');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    console.log('[Auth] checkAuth on mount');
    checkAuth();
  }, []);

  const login = async (email, password) => {
    console.log('[Auth] login');
    const { data } = await api.post('/api/auth/login', { email, password });
    if (!data.success) throw new Error(data.message || 'Login failed');
    const t = data.data.token;
    const u = data.data.user;
    localStorage.setItem('reviewsense_token', t);
    localStorage.setItem('reviewsense_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
    return u;
  };

  const register = async (name, email, password, role) => {
    console.log('[Auth] register', role || 'analyst');
    const { data } = await api.post('/api/auth/register', { name, email, password, role: role || 'analyst' });
    if (!data.success) throw new Error(data.message || 'Register failed');
    const t = data.data.token;
    const u = data.data.user;
    localStorage.setItem('reviewsense_token', t);
    localStorage.setItem('reviewsense_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
    return u;
  };

  const logout = () => {
    console.log('[Auth] logout');
    localStorage.removeItem('reviewsense_token');
    localStorage.removeItem('reviewsense_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
