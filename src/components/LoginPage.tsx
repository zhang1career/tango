/**
 * 登录页
 */

import React, {useState} from 'react';

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: 32,
    backgroundColor: '#252540',
    borderRadius: 12,
    border: '1px solid #333',
  },
  title: {
    margin: '0 0 24px 0',
    fontSize: 20,
    color: '#e8e8e8',
    textAlign: 'center',
  },
  field: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    marginBottom: 6,
    fontSize: 14,
    color: '#aaa',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    backgroundColor: '#1a1a2e',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#e8e8e8',
    boxSizing: 'border-box',
  },
  inputError: {
    borderColor: '#c44',
  },
  btn: {
    width: '100%',
    padding: '12px',
    marginTop: 8,
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#6d28d9',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  error: {
    marginTop: 12,
    fontSize: 13,
    color: '#f88',
    textAlign: 'center',
  },
};

export function LoginPage({
  login,
  onSuccess,
}: {
  login: (username: string, password: string) => boolean;
  onSuccess: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (login(username, password)) {
      onSuccess();
    } else {
      setError('用户名或密码错误');
    }
  };

  return (
    <div style={styles.container}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <h1 style={styles.title}>登录</h1>
        <div style={styles.field}>
          <label style={styles.label} htmlFor="login-username">用户名</label>
          <input
            id="login-username"
            type="text"
            style={styles.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div style={styles.field}>
          <label style={styles.label} htmlFor="login-password">密码</label>
          <input
            id="login-password"
            type="password"
            style={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button type="submit" style={styles.btn}>登录</button>
        {error && <p style={styles.error}>{error}</p>}
      </form>
    </div>
  );
}
