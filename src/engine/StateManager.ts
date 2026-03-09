/**
 * 游戏状态管理 - 变量、物品、声誉
 */

import type {RuntimeState} from '@/types';

export class StateManager {
  private state: RuntimeState;

  constructor(initial?: Partial<RuntimeState>) {
    this.state = {
      variables: initial?.variables ?? {},
      inventory: initial?.inventory ? [...initial.inventory] : [],
      reputation: initial?.reputation ? {...initial.reputation} : {},
    };
  }

  getState(): RuntimeState {
    return {
      variables: {...this.state.variables},
      inventory: [...this.state.inventory],
      reputation: {...this.state.reputation},
    };
  }

  // ---------- Inventory ----------
  addItem(item: string): void {
    if (!this.state.inventory.includes(item)) {
      this.state.inventory.push(item);
    }
  }

  removeItem(item: string): boolean {
    const i = this.state.inventory.indexOf(item);
    if (i === -1) return false;
    this.state.inventory.splice(i, 1);
    return true;
  }

  // ---------- Reputation ----------
  addReputation(entity: string, delta: number): void {
    this.state.reputation[entity] = (this.state.reputation[entity] ?? 0) + delta;
  }

  // ---------- Apply passage actions ----------
  applyActions(actions: {
    set?: Record<string, string | number | boolean>;
    give?: string | string[];
    take?: string | string[];
    rep?: Record<string, number>;
  }): void {
    if (actions.set) {
      for (const [k, v] of Object.entries(actions.set)) {
        this.state.variables[k] = v;
      }
    }
    if (actions.give) {
      const items = Array.isArray(actions.give) ? actions.give : [actions.give];
      for (const item of items) this.addItem(item);
    }
    if (actions.take) {
      const items = Array.isArray(actions.take) ? actions.take : [actions.take];
      for (const item of items) this.removeItem(item);
    }
    if (actions.rep) {
      for (const [entity, delta] of Object.entries(actions.rep)) {
        this.addReputation(entity, delta);
      }
    }
  }

  // ---------- Reset ----------
  reset(initial?: Partial<RuntimeState>): void {
    this.state = {
      variables: initial?.variables ?? {},
      inventory: initial?.inventory ? [...initial.inventory] : [],
      reputation: initial?.reputation ? {...initial.reputation} : {},
    };
  }
}
