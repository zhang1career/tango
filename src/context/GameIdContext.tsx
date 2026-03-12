import React, {createContext, useContext, useState, useCallback, type ReactNode} from 'react';
import {DEFAULT_GAME_ID} from '@/config';

type GameIdContextValue = {
  gameId: string;
  setGameId: (id: string) => void;
};

const GameIdContext = createContext<GameIdContextValue>({
  gameId: DEFAULT_GAME_ID,
  setGameId: () => {},
});

export function GameIdProvider({children}: {children: ReactNode}) {
  const [gameId, setGameIdState] = useState(DEFAULT_GAME_ID);
  const setGameId = useCallback((id: string) => setGameIdState(id), []);
  return (
    <GameIdContext.Provider value={{gameId, setGameId}}>
      {children}
    </GameIdContext.Provider>
  );
}

export function useGameId(): GameIdContextValue {
  const ctx = useContext(GameIdContext);
  if (!ctx) throw new Error('useGameId must be used within GameIdProvider');
  return ctx;
}
