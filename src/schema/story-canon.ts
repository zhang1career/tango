/**
 * 叙事状态快照 - story-canon.json（章/场结算后的唯一事实补充层）
 */

export const STORY_CANON_VERSION = '1';

export interface CanonCharacterState {
  location?: string;
  emotion?: string;
  /** 该角色当前已知的事实摘要 */
  knows?: string[];
}

export interface CanonSceneState {
  lastUpdatedAt?: string;
  /** 本场结局的浓缩陈述，供后续场次快速接续 */
  summary?: string;
  characterStates?: Record<string, CanonCharacterState>;
  /** 本场结束后仍可核验的客观事实（事件、决定、道具、关系、时空落点） */
  facts?: string[];
  openQuestions?: string[];
}

export interface StoryCanon {
  version: string;
  globalNotes?: string;
  scenes: Record<string, CanonSceneState>;
}

export const EMPTY_STORY_CANON: StoryCanon = {
  version: STORY_CANON_VERSION,
  scenes: {},
};

export function normalizeStoryCanon(raw: unknown): StoryCanon {
  if (!raw || typeof raw !== 'object') return {...EMPTY_STORY_CANON};
  const o = raw as Record<string, unknown>;
  const scenes: Record<string, CanonSceneState> = {};
  if (o.scenes && typeof o.scenes === 'object' && !Array.isArray(o.scenes)) {
    for (const [sid, val] of Object.entries(o.scenes as Record<string, unknown>)) {
      if (!val || typeof val !== 'object') continue;
      const v = val as Record<string, unknown>;
      const characterStates: Record<string, CanonCharacterState> = {};
      if (v.characterStates && typeof v.characterStates === 'object') {
        for (const [cid, cs] of Object.entries(v.characterStates as Record<string, unknown>)) {
          if (!cs || typeof cs !== 'object') continue;
          const c = cs as Record<string, unknown>;
          characterStates[cid] = {
            location: typeof c.location === 'string' ? c.location : undefined,
            emotion: typeof c.emotion === 'string' ? c.emotion : undefined,
            knows: Array.isArray(c.knows) ? c.knows.map(String) : undefined,
          };
        }
      }
      scenes[sid] = {
        lastUpdatedAt: typeof v.lastUpdatedAt === 'string' ? v.lastUpdatedAt : undefined,
        summary: typeof v.summary === 'string' && v.summary.trim() ? v.summary.trim() : undefined,
        characterStates: Object.keys(characterStates).length ? characterStates : undefined,
        facts: Array.isArray(v.facts) ? v.facts.map(String) : undefined,
        openQuestions: Array.isArray(v.openQuestions) ? v.openQuestions.map(String) : undefined,
      };
    }
  }
  return {
    version: String(o.version ?? STORY_CANON_VERSION),
    globalNotes: typeof o.globalNotes === 'string' ? o.globalNotes : undefined,
    scenes,
  };
}
