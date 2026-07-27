import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Spinner } from '../components/shared';

export default function Login() {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('admin@danitec.at');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Anmeldung fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo.png" alt="DANITEC Kälte & Klimatechnik"
            style={{ height: 70, objectFit: 'contain', marginBottom: 12, display: 'block', margin: '0 auto 12px' }}/>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', letterSpacing: 1 }}>Betriebsverwaltung</p>
        </div>

        {error && <div className="login-error"><i className="ti ti-alert-circle" style={{ marginRight: 6 }}/>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>E-Mail-Adresse</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@danitec.at"
              autoComplete="email"
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>Passwort</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
          <button
            type="submit"
            className="btn primary"
            style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
            disabled={loading}
          >
            {loading ? <Spinner/> : <><i className="ti ti-login"/>Anmelden</>}
          </button>
        </form>

        <div style={{ marginTop: 20, padding: '12px 14px', background: 'var(--bg)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-secondary)' }}>
          <strong>Demo-Zugangsdaten:</strong><br/>
          E-Mail: admin@danitec.at<br/>
          Passwort: Danitec2025!
        </div>
      </div>
    </div>
  );
}
