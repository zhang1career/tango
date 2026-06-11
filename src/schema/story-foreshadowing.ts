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

export interface ForeshadowStatusStyle {
  color: string;
  backgroundColor: string;
}

/** 伏笔生命周期状态色：待埋设 / 已埋设 / 已回收 */
export function foreshadowStatusStyle(status: ForeshadowStatus): ForeshadowStatusStyle {
  switch (status) {
    case 'planned':
      return {color: '#fbbf24', backgroundColor: 'rgba(251, 191, 36, 0.15)'};
    case 'planted':
      return {color: '#90caf9', backgroundColor: 'rgba(144, 202, 249, 0.15)'};
    case 'resolved':
      return {color: '#86efac', backgroundColor: 'rgba(134, 239, 172, 0.15)'};
  }
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
  /** 生成/块级约束参考用触发词 */
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

export function foreshadowThreadPriority(thread: {priority?: number}): number {
  return thread.priority ?? 2;
}

/** 本块生成时伏笔的身份：埋设 / 照应 / 回收 */
export type ForeshadowGenerationRole = 'plant' | 'echo' | 'payoff';

export const FORESHADOW_GENERATION_ROLE_LABELS: Record<ForeshadowGenerationRole, string> = {
  plant: '埋设',
  echo: '照应',
  payoff: '回收',
};

export interface ForeshadowThreadForGeneration {
  id: string;
  title: string;
  role: ForeshadowGenerationRole;
  roleLabel: string;
  setup?: string;
  payoff?: string;
  priority?: number;
}

const PAYOFF_TARGET_SEP = /[、,，]/;

/** 从「回收目标」解析 scene id 列表（保序，忽略非 scene id 文本） */
export function parsePayoffTargetSceneIds(payoffTarget: string | undefined): string[] {
  if (!payoffTarget?.trim()) return [];
  return payoffTarget
    .split(PAYOFF_TARGET_SEP)
    .map((s) => s.trim())
    .filter((part) => /^scene_/.test(part));
}

export function matchesPlantedBlock(
  plantedIn: ForeshadowPlantRef | undefined,
  sceneId: string,
  passageBlockIndex?: number
): boolean {
  const plantedScene = plantedIn?.sceneId?.trim();
  if (!plantedScene || plantedScene !== sceneId) return false;
  if (plantedIn!.blockIndex === undefined) return true;
  if (passageBlockIndex === undefined) return true;
  return plantedIn!.blockIndex === passageBlockIndex;
}

/** 判定当前场景（及可选块序）下伏笔的生成身份；待埋设 / 已回收 / 无关场景返回 null */
export function foreshadowGenerationRole(
  thread: ForeshadowThread,
  sceneId: string,
  passageBlockIndex?: number
): ForeshadowGenerationRole | null {
  if (thread.status !== 'planted') return null;

  if (matchesPlantedBlock(thread.plantedIn, sceneId, passageBlockIndex)) {
    return 'plant';
  }

  const payoffScenes = parsePayoffTargetSceneIds(thread.payoffTarget);
  const idx = payoffScenes.indexOf(sceneId);
  if (idx < 0) return null;
  return idx === payoffScenes.length - 1 ? 'payoff' : 'echo';
}

/** 章节页只读：已埋设且「回收目标」与本章场景池有交集 */
export function foreshadowThreadsForChapter(
  threads: ForeshadowThread[],
  chapterSceneIds: Iterable<string>
): ForeshadowThread[] {
  const pool = new Set(chapterSceneIds);
  return threads.filter((t) => {
    if (t.status !== 'planted') return false;
    return parsePayoffTargetSceneIds(t.payoffTarget).some((sid) => pool.has(sid));
  });
}

/**
 * 参与内容生成的伏笔：仅已埋设且与当前场景相关。
 * 身份规则：埋设位置 → 埋设；回收目标末项 → 回收；回收目标前项 → 照应。
 */
export function foreshadowThreadsForGeneration(
  threads: ForeshadowThread[],
  sceneId: string,
  passageBlockIndex?: number,
  limit = 12
): ForeshadowThreadForGeneration[] {
  const matched: ForeshadowThreadForGeneration[] = [];
  for (const thread of threads) {
    const role = foreshadowGenerationRole(thread, sceneId, passageBlockIndex);
    if (!role) continue;
    matched.push({
      id: thread.id,
      title: thread.title,
      role,
      roleLabel: FORESHADOW_GENERATION_ROLE_LABELS[role],
      setup: thread.setup,
      payoff: thread.payoff,
      priority: thread.priority,
    });
  }
  return matched
    .sort((a, b) => foreshadowThreadPriority(a) - foreshadowThreadPriority(b))
    .slice(0, limit);
}

export function canPlantForeshadowThread(thread: ForeshadowThread): boolean {
  return thread.status === 'planned' && !!thread.plantedIn?.sceneId?.trim();
}

export function canClearForeshadowThread(thread: ForeshadowThread): boolean {
  return thread.status === 'planted' || thread.status === 'resolved';
}

/** 按表单中的埋设场景 / 块序标记为已埋设 */
export function plantForeshadowThread(thread: ForeshadowThread): ForeshadowThread {
  const sceneId = thread.plantedIn?.sceneId?.trim();
  if (!sceneId || thread.status !== 'planned') return thread;
  const blockIndex = thread.plantedIn?.blockIndex;
  return {
    ...thread,
    status: 'planted',
    plantedIn: blockIndex === undefined ? {sceneId} : {sceneId, blockIndex},
  };
}

/** 清除埋设与回收位置，回到待埋设 */
export function clearForeshadowThread(thread: ForeshadowThread): ForeshadowThread {
  return {
    ...thread,
    status: 'planned',
    plantedIn: undefined,
    resolvedIn: undefined,
  };
}

/** 状态下拉变更时同步清理 plantedIn / resolvedIn */
export function applyForeshadowStatusChange(
  thread: ForeshadowThread,
  nextStatus: ForeshadowStatus
): ForeshadowThread {
  if (nextStatus === thread.status) return thread;
  if (nextStatus === 'planned') {
    if (thread.status === 'resolved') return clearForeshadowThread(thread);
    if (thread.status === 'planted') return {...thread, status: 'planned', plantedIn: undefined};
    return {...thread, status: 'planned'};
  }
  return {...thread, status: nextStatus};
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
