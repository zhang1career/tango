/**
 * 游戏引擎 - 管理段落、历史、导航、变量/物品/声誉
 */

import type { Passage, PassageLink, Story, InitialRuntimeState, PassageStateActions } from '../types';
import { StateManager } from './StateManager';
import { evaluateCondition } from './ConditionEvaluator';

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

  get currentPassage(): Passage | null {
    return this.state.currentPassage;
  }

  get history(): string[] {
    return [...this.state.history];
  }

  /** 当前段落下满足条件的可见链接 */
  getVisibleLinks(): PassageLink[] {
    const passage = this.state.currentPassage;
    if (!passage) return [];
    const ctx = this.stateManager.getState();
    return passage.links.filter((link) => {
      if (!link.condition) return true;
      return evaluateCondition(link.condition, ctx);
    });
  }

  /** 变量/物品/声誉 API */
  setVar(key: string, value: string | number | boolean): void {
    this.stateManager.setVar(key, value);
  }
  getVar(key: string): string | number | boolean | undefined {
    return this.stateManager.getVar(key);
  }
  addItem(item: string): void {
    this.stateManager.addItem(item);
  }
  removeItem(item: string): boolean {
    return this.stateManager.removeItem(item);
  }
  hasItem(item: string): boolean {
    return this.stateManager.hasItem(item);
  }
  setReputation(entity: string, value: number): void {
    this.stateManager.setReputation(entity, value);
  }
  addReputation(entity: string, delta: number): void {
    this.stateManager.addReputation(entity, delta);
  }
  getReputation(entity: string): number {
    return this.stateManager.getReputation(entity);
  }

  goTo(passageNameOrId: string): boolean {
    const passage = this.getPassage(passageNameOrId);
    if (!passage) return false;

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
  }
}
