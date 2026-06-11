import {useCallback, useEffect, useRef} from 'react';
import {patchStoryFm} from '@/services/game-resource-patch';
import type {JsonPatchOp} from '@/utils/json-patch';

export function useDebouncedStoryFmPatch(gameId: string, delayMs = 600) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<JsonPatchOp[]>([]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const flush = useCallback(async () => {
    if (!pending.current.length) return;
    const patches = pending.current;
    pending.current = [];
    await patchStoryFm(gameId, patches);
  }, [gameId]);

  const queue = useCallback(
    (patches: JsonPatchOp[]) => {
      pending.current.push(...patches);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush().catch(() => {
          /* caller may surface via notification */
        });
      }, delayMs);
    },
    [delayMs, flush]
  );

  return {queue, flush};
}
