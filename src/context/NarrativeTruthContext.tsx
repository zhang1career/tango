import React, {createContext, useCallback, useContext, useMemo, useState} from 'react';

type NarrativeTruthContextValue = {
  revision: number;
  bumpRevision: () => void;
};

const NarrativeTruthContext = createContext<NarrativeTruthContextValue>({
  revision: 0,
  bumpRevision: () => undefined,
});

export function NarrativeTruthProvider({children}: {children: React.ReactNode}) {
  const [revision, setRevision] = useState(0);
  const bumpRevision = useCallback(() => setRevision((v) => v + 1), []);
  const value = useMemo(() => ({revision, bumpRevision}), [revision, bumpRevision]);
  return <NarrativeTruthContext.Provider value={value}>{children}</NarrativeTruthContext.Provider>;
}

export function useNarrativeTruth(): NarrativeTruthContextValue {
  return useContext(NarrativeTruthContext);
}
