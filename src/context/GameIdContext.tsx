import React, {createContext, useContext, useState, useCallback, useEffect, type ReactNode} from 'react';
import {DEFAULT_GAME_ID} from '@/config';
import {isValidGameId, resolveInitialGameId, setGameIdInUrl} from '@/utils/game-url';

type GameIdContextValue = {
  gameId: string;
  setGameId: (id: string) => void;
  gameIds: string[];
  refetchGameIds: () => Promise<void>;
};

const GameIdContext = createContext<GameIdContextValue>({
  gameId: DEFAULT_GAME_ID,
  setGameId: () => {},
  gameIds: [DEFAULT_GAME_ID],
  refetchGameIds: async () => {},
});

function ensureInList(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

export function GameIdProvider({children}: {children: ReactNode}) {
  const [gameId, setGameIdState] = useState(resolveInitialGameId);
  const [gameIds, setGameIds] = useState<string[]>(() => [resolveInitialGameId()]);

  const refetchGameIds = useCallback(async () => {
    try {
      const res = await fetch('/api/games/list');
      if (res.ok) {
        const list = (await res.json()) as string[];
        const ids = Array.isArray(list) && list.length > 0 ? list : [DEFAULT_GAME_ID];
        setGameIds((prev) => ensureInList(ids.includes(gameId) ? ids : [...ids, gameId], gameId));
        return;
      }
    } catch {
      // 静态部署无 API：保留 URL/当前选中的 gameId
    }
    setGameIds((prev) => ensureInList(prev.length > 0 ? prev : [DEFAULT_GAME_ID], gameId));
  }, [gameId]);

  useEffect(() => {
    refetchGameIds();
  }, [refetchGameIds]);

  const setGameId = useCallback((id: string) => {
    const next = isValidGameId(id) ? id : DEFAULT_GAME_ID;
    setGameIdState(next);
    setGameIds((prev) => ensureInList(prev, next));
    setGameIdInUrl(next);
  }, []);

  // 支持浏览器前进/后退切换 ?game=
  useEffect(() => {
    const onPopState = () => {
      const fromUrl = resolveInitialGameId();
      setGameIdState(fromUrl);
      setGameIds((prev) => ensureInList(prev, fromUrl));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <GameIdContext.Provider value={{gameId, setGameId, gameIds, refetchGameIds}}>
      {children}
    </GameIdContext.Provider>
  );
}

export function useGameId(): GameIdContextValue {
  const ctx = useContext(GameIdContext);
  if (!ctx) throw new Error('useGameId must be used within GameIdProvider');
  return ctx;
}
