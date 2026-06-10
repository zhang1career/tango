/**
 * 伏笔池 - story-foreshadowing.json
 */

export type ForeshadowStatus = 'planned' | 'planted' | 'resolved';

export const FORESHADOW_STATUS_OPTIONS: {value: ForeshadowStatus; label: string}[] = [
  {value: 'planned', label: '待埋设'},
  {value: 'planted', label: '已埋设'},
  {value: 'resolved', label: '已回收'},
];

export function foreshadowStatusLabel(status: ForeshadowStatus): string {
  return FORESHADOW_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export interface ForeshadowPlantRef {
  sceneId: string;
  blockIndex?: number;
}

export interface ForeshadowThread {
  id: string;
  title: string;
  status: ForeshadowStatus;
  /** 埋设要点：读者应注意到什么 */
  setup?: string;
  /** 回收要点：须兑现什么信息或情绪 */
  payoff?: string;
  plantedIn?: ForeshadowPlantRef;
  resolvedIn?: ForeshadowPlantRef;
  /** 生成/自动埋设匹配用触发词 */
  anchors?: string[];
  /** 1 高 – 3 低；未设视为 2 */
  priority?: number;
  /** 须于此场景前完成回收（scene id） */
  payoffBy?: string;
  /** 预期回收说明或目标场景 id（兼容旧字段） */
  payoffTarget?: string;
  notes?: string;
}

export interface StoryForeshadowing {
  threads: ForeshadowThread[];
}

export const EMPTY_STORY_FORESHADOWING: StoryForeshadowing = {threads: []};

function normalizePlantRef(raw: unknown): ForeshadowPlantRef | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const sceneId = String(o.sceneId ?? '').trim();
  if (!sceneId) return undefined;
  const blockIndex =
    typeof o.blockIndex === 'number' && Number.isFinite(o.blockIndex) ? o.blockIndex : undefined;
  return blockIndex === undefined ? {sceneId} : {sceneId, blockIndex};
}

function normalizeAnchors(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const anchors = raw.map((a) => String(a).trim()).filter(Boolean);
  return anchors.length ? anchors : undefined;
}

function normalizePriority(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const n = Math.round(raw);
  if (n < 1 || n > 3) return undefined;
  return n;
}

export function foreshadowThreadPriority(thread: ForeshadowThread): number {
  return thread.priority ?? 2;
}

/** 未回收伏笔，按 priority 升序（1 优先注入 context） */
export function openForeshadowingThreads(threads: ForeshadowThread[], limit = 12): ForeshadowThread[] {
  return threads
    .filter((t) => t.status !== 'resolved')
    .sort((a, b) => foreshadowThreadPriority(a) - foreshadowThreadPriority(b))
    .slice(0, limit);
}

export function foreshadowAnchorHit(thread: ForeshadowThread, blockAnchors: string[]): boolean {
  if (!blockAnchors.length) return false;
  const keys = (thread.anchors?.length ? thread.anchors : [thread.title]).filter(Boolean);
  return blockAnchors.some((a) => {
    const al = a.toLowerCase();
    return keys.some((k) => {
      const kl = k.toLowerCase();
      return al.includes(kl) || kl.includes(al);
    });
  });
}

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
          return {
            id: String(t.id ?? ''),
            title: String(t.title ?? ''),
            status: validStatus,
            setup: typeof t.setup === 'string' ? t.setup : undefined,
            payoff: typeof t.payoff === 'string' ? t.payoff : undefined,
            plantedIn: normalizePlantRef(t.plantedIn),
            resolvedIn: normalizePlantRef(t.resolvedIn),
            anchors: normalizeAnchors(t.anchors),
            priority: normalizePriority(t.priority),
            payoffBy: typeof t.payoffBy === 'string' ? t.payoffBy : undefined,
            payoffTarget: typeof t.payoffTarget === 'string' ? t.payoffTarget : undefined,
            notes: typeof t.notes === 'string' ? t.notes : undefined,
          };
        })
        .filter((t) => t.id)
    : [];
  return {threads};
}
