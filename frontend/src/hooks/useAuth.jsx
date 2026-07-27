import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  // Token prüfen beim Start
  useEffect(() => {
    const token = localStorage.getItem('danitec_token');
    if (!token) { setLoading(false); return; }
    api.me()
      .then(meData => {
        setUser(meData.user);
        return api.company().then(coData => setCompany(coData.company)).catch(() => {});
      })
      .catch(err => {
        // Token nur bei 401 löschen, nicht bei Netzwerkfehler
        if (err?.message?.includes('401') || err?.message?.includes('Unauthorized')) {
          localStorage.removeItem('danitec_token');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    localStorage.setItem('danitec_token', data.token);
    setUser(data.user);
    setCompany(data.company);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('danitec_token');
    setUser(null);
    setCompany(null);
  }, []);

  const can = useCallback((roles) => {
    if (!user) return false;
    if (!roles || roles.length === 0) return true;
    return roles.includes(user.role);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, company, loading, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
