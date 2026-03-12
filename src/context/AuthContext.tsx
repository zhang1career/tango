/**
 * 鉴权：登录、注销、保存前检查
 * 用户名 admin，密码从 VITE_ADMIN_PASS 读取；登录过期时长从 VITE_AUTH_EXPIRE_MINUTES 读取（分钟）
 */

import React, {createContext, useCallback, useContext, useEffect, useState, type ReactNode} from 'react';

const STORAGE_KEY = 'ta_user';

const ADMIN_USER = 'admin';

const DEFAULT_AUTH_EXPIRE_MINUTES = 120;

function getAdminPass(): string {
  return (import.meta.env.VITE_ADMIN_PASS ?? '') as string;
}

/** 登录有效时长（分钟），未配置或无效时使用默认 120 分钟 */
function getAuthExpireMinutes(): number {
  const v = import.meta.env.VITE_AUTH_EXPIRE_MINUTES;
  const n = typeof v === 'string' ? parseInt(v, 10) : NaN;
  return Number.isNaN(n) || n < 1 ? DEFAULT_AUTH_EXPIRE_MINUTES : n;
}

interface StoredAuth {
  user: string;
  expiresAt: number;
}

function readStoredUser(): string | null {
  try {
    const s = sessionStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const parsed = JSON.parse(s) as unknown;
    if (parsed && typeof parsed === 'object' && 'user' in parsed && typeof (parsed as StoredAuth).user === 'string') {
      const { user, expiresAt } = parsed as StoredAuth;
      if (typeof expiresAt === 'number' && Date.now() < expiresAt) return user;
    }
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

export type AuthCheckResult = { ok: true } | { ok: false; needLogin: true } | { ok: false; unauthorized: true };

export type AuthContextValue = {
  user: string | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  /** 保存前调用：若未登录跳转登录页并记录 returnTo；若未授权显示通知；若 ok 返回 true 才可执行保存 */
  checkAuthForSave: (callback: () => void | Promise<void>) => Promise<void>;
  showLogin: boolean;
  setShowLogin: (v: boolean) => void;
  returnTo: { mode: string; gameId: string } | null;
  clearReturnTo: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  getReturnTo,
  onUnauthorized,
}: {
  children: ReactNode;
  getReturnTo: () => { mode: string; gameId: string };
  onUnauthorized?: () => void;
}) {
  const [user, setUser] = useState<string | null>(readStoredUser);
  const [showLogin, setShowLogin] = useState(false);
  const [returnTo, setReturnToState] = useState<{ mode: string; gameId: string } | null>(null);

  // 定期重新校验登录是否过期，刷新页面时 readStoredUser 会执行，但若不刷新则依赖此定时器
  useEffect(() => {
    const id = setInterval(() => {
      const valid = readStoredUser();
      setUser((prev) => (prev && !valid ? null : prev));
    }, 10000); // 每 10 秒检查一次
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (user) {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        let expiresAt = Date.now() + getAuthExpireMinutes() * 60 * 1000;
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (parsed && typeof parsed === 'object' && 'expiresAt' in parsed && typeof (parsed as StoredAuth).expiresAt === 'number') {
            expiresAt = (parsed as StoredAuth).expiresAt;
          }
        }
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user, expiresAt } satisfies StoredAuth));
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  const login = useCallback((username: string, password: string): boolean => {
    if (username === ADMIN_USER && password === getAdminPass()) {
      const expiresAt = Date.now() + getAuthExpireMinutes() * 60 * 1000;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user: username, expiresAt } satisfies StoredAuth));
      setUser(username);
      setShowLogin(false);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setShowLogin(false);
    setReturnToState(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const checkAuthForSave = useCallback(
    async (callback: () => void | Promise<void>) => {
      if (!user) {
        setReturnToState(getReturnTo());
        setShowLogin(true);
        return;
      }
      // 当前写死：登录即授权。后续可接入接口判断权限
      await callback();
    },
    [user, getReturnTo]
  );

  const value: AuthContextValue = {
    user,
    login,
    logout,
    checkAuthForSave,
    showLogin,
    setShowLogin,
    returnTo,
    clearReturnTo: useCallback(() => setReturnToState(null), []),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
