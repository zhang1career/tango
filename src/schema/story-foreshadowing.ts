/**
 * 伏笔池 - story-foreshadowing.json
 */

export type ForeshadowStatus = 'planned' | 'planted' | 'resolved';

export interface ForeshadowPlantRef {
  sceneId: string;
  blockIndex?: number;
}

export interface ForeshadowThread {
  id: string;
  title: string;
  status: ForeshadowStatus;
  plantedIn?: ForeshadowPlantRef;
  /** 预期回收说明或目标场景 id */
  payoffTarget?: string;
  notes?: string;
}

export interface StoryForeshadowing {
  threads: ForeshadowThread[];
}

export const EMPTY_STORY_FORESHADOWING: StoryForeshadowing = {threads: []};

export function normalizeStoryForeshadowing(raw: unknown): StoryForeshadowing {
  if (!raw || typeof raw !== 'object') return {...EMPTY_STORY_FORESHADOWING};
  const o = raw as Record<string, unknown>;
  const threads = Array.isArray(o.threads)
    ? o.threads
        .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
        .map((t) => {
          const status = t.status as ForeshadowStatus;
          const validStatus =
            status === 'planned' || status === 'planted' || status === 'resolved' ? status : 'planned';
          const planted =
            t.plantedIn && typeof t.plantedIn === 'object'
              ? {
                  sceneId: String((t.plantedIn as Record<string, unknown>).sceneId ?? ''),
                  blockIndex:
                    typeof (t.plantedIn as Record<string, unknown>).blockIndex === 'number'
                      ? (t.plantedIn as Record<string, unknown>).blockIndex as number
                      : undefined,
                }
              : undefined;
          return {
            id: String(t.id ?? ''),
            title: String(t.title ?? ''),
            status: validStatus,
            plantedIn: planted?.sceneId ? planted : undefined,
            payoffTarget: typeof t.payoffTarget === 'string' ? t.payoffTarget : undefined,
            notes: typeof t.notes === 'string' ? t.notes : undefined,
          };
        })
        .filter((t) => t.id)
    : [];
  return {threads};
}
