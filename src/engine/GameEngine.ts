/**
 * 游戏引擎 - 管理段落、历史、导航、变量/物品/声誉
 */

import type {InitialRuntimeState, Passage, PassageLink, PassageStateActions, Story} from '@/types';
import {StateManager} from './StateManager';
import {evaluateCondition} from './ConditionEvaluator';

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
  /** 已使用的行为 id 集合，用于 onlyOnce 等准入规则 */
  usedBehaviorIds = new Set<string>();

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
    this.stateManager = new StateManager(initRuntime);
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
    return this.story.passages.get(normalized);
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

    const actions = getPassageActions(passage.metadata);
    if (actions) {
      this.stateManager.applyActions(actions);
    }

    if (this.state.currentPassage) {
      this.state.history.push(this.state.currentPassage.id);
    }
    this.state.currentPassage = passage;
    this.state.isEnding = passage.links.length === 0;
    return true;
  }

  goBack(): boolean {
    const prev = this.state.history.pop();
    if (!prev) return false;
    const passage = this.getPassage(prev);
    if (!passage) return false;
    this.state.currentPassage = passage;
    this.state.isEnding = false;
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
