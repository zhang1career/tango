/**
 * 游戏引擎 - 管理段落、历史、导航、变量/物品/声誉
 */

import type {InitialRuntimeState, Passage, PassageLink, PassageStateActions, Story} from '@/types';
import {StateManager} from './StateManager';
import {evaluateCondition} from './ConditionEvaluator';
import type {GameActionRef} from '@/schema/action-ref';

export interface GameState {
  story: Story;
  currentPassage: Passage | null;
  history: string[];
  isEnding: boolean;
  variables: Record<string, string | number | boolean>;
  inventory: string[];
  reputation: Record<string, number>;
}

function getInitialRuntime(metadata?: Record<string, unknown>): Partial<InitialRuntimeState> | undefined {
  if (!metadata) return undefined;
  const init: Partial<InitialRuntimeState> = {};
  if (metadata.variables && typeof metadata.variables === 'object') {
    init.variables = metadata.variables as Record<string, string | number | boolean>;
  }
  if (Array.isArray(metadata.inventory)) {
    init.inventory = metadata.inventory as string[];
  }
  if (metadata.reputation && typeof metadata.reputation === 'object') {
    init.reputation = metadata.reputation as Record<string, number>;
  }
  return Object.keys(init).length ? init : undefined;
}

function getPassageActions(metadata?: Record<string, unknown>): PassageStateActions | undefined {
  if (!metadata) return undefined;
  const actions: PassageStateActions = {};
  if (metadata.set && typeof metadata.set === 'object') {
    actions.set = metadata.set as Record<string, string | number | boolean>;
  }
  if (metadata.give !== undefined) {
    actions.give = Array.isArray(metadata.give)
      ? (metadata.give as string[])
      : (metadata.give as string);
  }
  if (metadata.take !== undefined) {
    actions.take = Array.isArray(metadata.take)
      ? (metadata.take as string[])
      : (metadata.take as string);
  }
  if (metadata.rep && typeof metadata.rep === 'object') {
    actions.rep = metadata.rep as Record<string, number>;
  }
  return Object.keys(actions).length ? actions : undefined;
}

export class GameEngine {
  private state: {
    story: Story;
    currentPassage: Passage | null;
    history: string[];
    isEnding: boolean;
  };
  private stateManager: StateManager;
  private actionListeners = new Set<(action: GameActionRef) => void>();
  /** 已使用的行为 id 集合，用于 onlyOnce 等准入规则 */
  usedBehaviorIds = new Set<string>();
  /** 已使用的事件 id 集合，用于事件准入（onlyOnce 等） */
  usedEventIds = new Set<string>();

  constructor(story: Story) {
    const startId = story.startPassageId.trim().replace(/\s+/g, '_');
    const startPassage = story.passages.get(startId) ?? story.passages.values().next().value ?? null;
    const initRuntime = getInitialRuntime(story.metadata);
    this.state = {
      story,
      currentPassage: startPassage,
      history: [],
      isEnding: startPassage ? startPassage.links.length === 0 : false,
    };
    this.stateManager = new StateManager(initRuntime, {
      onItemObtained: (itemId) => {
        this.emitAction({
          type: 'item.obtain',
          itemId,
          sceneId: this.getCurrentSceneId(),
        });
      },
    });
  }

  private getCurrentSceneId(): string | undefined {
    const current = this.state.currentPassage;
    const metaSceneId = current?.metadata?.['sceneId'];
    if (typeof metaSceneId === 'string' && metaSceneId.trim()) return metaSceneId.trim();
    return current?.id;
  }

  private emitAction(action: GameActionRef): void {
    for (const listener of this.actionListeners) listener(action);
  }

  onAction(listener: (action: GameActionRef) => void): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  getState(): GameState {
    const runtime = this.stateManager.getState();
    return {
      ...this.state,
      variables: runtime.variables,
      inventory: runtime.inventory,
      reputation: runtime.reputation,
    };
  }

  getPassage(id: string): Passage | undefined {
    const normalized = id.trim().replace(/\s+/g, '_');
    const direct = this.story.passages.get(normalized);
    if (direct) return direct;

    // 兼容：目标可能以名称传入（非 id）
    for (const [, p] of this.story.passages) {
      if (p.name?.trim().replace(/\s+/g, '_') === normalized) return p;
    }

    // 兼容旧数据：分页场景常见目标写成 `chX.scene_YY`，实际首屏节点为 `chX.scene_YY.p_100`
    const pagedFirst = this.story.passages.get(`${normalized}.p_100`);
    if (pagedFirst) return pagedFirst;

    // 最后兜底：若存在 `normalized.p_XXX`，取最小页号
    let best: { num: number; passage: Passage } | null = null;
    const prefix = `${normalized}.p_`;
    for (const [pid, p] of this.story.passages) {
      if (!pid.startsWith(prefix)) continue;
      const num = Number(pid.slice(prefix.length));
      if (Number.isNaN(num)) continue;
      if (!best || num < best.num) best = {num, passage: p};
    }
    return best?.passage;
  }

  get story(): Story {
    return this.state.story;
  }

  /** 当前段落下满足条件的可见链接 */
  getVisibleLinks(): PassageLink[] {
    const passage = this.state.currentPassage;
    if (!passage) return [];
    const ctx = this.stateManager.getState();
    const visitedIds = new Set([
      ...this.state.history,
      this.state.currentPassage?.id,
      this.state.currentPassage?.name,
    ].filter(Boolean) as string[]);
    return passage.links.filter((link) => {
      if (!link.condition) return true;
      const target = this.getPassage(link.passageName);
      const entityCtx = target ? { entity: target, visitedIds } : undefined;
      return evaluateCondition(link.condition, ctx, entityCtx);
    });
  }

  /** 跳转到指定 passage；可选传入 link 以先执行 Sugarcube setter（linkActions） */
  goTo(passageNameOrId: string, link?: PassageLink): boolean {
    const passage = this.getPassage(passageNameOrId);
    if (!passage) return false;

    if (link?.linkActions) {
      this.stateManager.applyActions(link.linkActions);
    }

    const meta = passage.metadata;
    const chapterSet: Record<string, string | number | boolean> = {};
    if (meta && typeof meta.chapterId === 'string' && meta.chapterId.trim()) {
      chapterSet.activeChapterId = meta.chapterId.trim();
      const mode = meta.chapterMode;
      if (mode === 'narrative' || mode === 'open_world') {
        chapterSet[`chapterMode_${meta.chapterId.trim()}`] = mode;
      }
    }

    const actions = getPassageActions(meta);
    const mergedActions = actions
      ? {...actions, set: {...chapterSet, ...(actions.set ?? {})}}
      : Object.keys(chapterSet).length
        ? {set: chapterSet}
        : undefined;
    if (mergedActions) {
      this.stateManager.applyActions(mergedActions);
    }

    if (this.state.currentPassage) {
      this.state.history.push(this.state.currentPassage.id);
    }
    this.state.currentPassage = passage;
    this.state.isEnding = passage.links.length === 0;
    this.emitAction({
      type: 'scene.enter',
      sceneId: this.getCurrentSceneId(),
    });
    return true;
  }

  goBack(): boolean {
    const prev = this.state.history.pop();
    if (!prev) return false;
    const passage = this.getPassage(prev);
    if (!passage) return false;
    this.state.currentPassage = passage;
    this.state.isEnding = false;
    this.emitAction({
      type: 'scene.enter',
      sceneId: this.getCurrentSceneId(),
    });
    return true;
  }

  canGoBack(): boolean {
    return this.state.history.length > 0;
  }

  restart(): void {
    const initRuntime = getInitialRuntime(this.state.story.metadata);
    this.stateManager.reset(initRuntime);
    this.state.currentPassage = this.getPassage(this.state.story.startPassageId) ?? null;
    this.state.history = [];
    this.state.isEnding = false;
    this.usedBehaviorIds.clear();
    this.usedEventIds.clear();
    this.emitAction({
      type: 'scene.enter',
      sceneId: this.getCurrentSceneId(),
    });
  }

  /** 应用状态变更（供行为交互系统执行回写） */
  applyActions(actions: {
    set?: Record<string, string | number | boolean>;
    give?: string | string[];
    take?: string | string[];
    rep?: Record<string, number>;
  }): void {
    this.stateManager.applyActions(actions);
  }
}
