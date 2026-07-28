import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auto-Login beim Start – kein Passwort nötig
  useEffect(() => {
    const token = localStorage.getItem('danitec_token');

    const doAutoLogin = () =>
      api.login('admin@danitec.at', 'Danitec2025!')
        .then(data => {
          localStorage.setItem('danitec_token', data.token);
          setUser(data.user);
          setCompany(data.company);
        })
        .catch(() => {})
        .finally(() => setLoading(false));

    if (!token) {
      doAutoLogin();
      return;
    }

    // Vorhandenen Token prüfen, bei Fehler neu einloggen
    api.me()
      .then(meData => {
        setUser(meData.user);
        return api.company().then(coData => setCompany(coData.company)).catch(() => {});
      })
      .catch(() => {
        localStorage.removeItem('danitec_token');
        return doAutoLogin();
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
