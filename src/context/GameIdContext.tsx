import React, {createContext, useContext, useState, useCallback, useEffect, type ReactNode} from 'react';
import {DEFAULT_GAME_ID} from '@/config';

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

export function GameIdProvider({children}: {children: ReactNode}) {
  const [gameId, setGameIdState] = useState(DEFAULT_GAME_ID);
  const [gameIds, setGameIds] = useState<string[]>([DEFAULT_GAME_ID]);

  const refetchGameIds = useCallback(async () => {
    try {
      const res = await fetch('/api/games/list');
      if (res.ok) {
        const list = (await res.json()) as string[];
        setGameIds(Array.isArray(list) && list.length > 0 ? list : [DEFAULT_GAME_ID]);
      }
    } catch {
      setGameIds([DEFAULT_GAME_ID]);
    }
  }, []);

  useEffect(() => {
    refetchGameIds();
  }, [refetchGameIds]);

  const setGameId = useCallback((id: string) => setGameIdState(id), []);

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
