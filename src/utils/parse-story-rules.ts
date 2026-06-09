import type {GameRule} from '../schema/game-rule';
import type {SceneRuleBinding, StoryRulesBundle} from '../schema/story-rules-bundle';
import {normalizeGameRules} from './normalize-game-rules';

export function parseStoryRulesFile(data: unknown): StoryRulesBundle {
  if (Array.isArray(data)) {
    return {rules: normalizeGameRules(data as GameRule[]), sceneBindings: []};
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const rules = Array.isArray(obj.rules) ? normalizeGameRules(obj.rules as GameRule[]) : [];
    const sceneBindings = Array.isArray(obj.sceneBindings)
      ? (obj.sceneBindings as SceneRuleBinding[])
      : [];
    return {rules, sceneBindings};
  }
  return {rules: [], sceneBindings: []};
}

export function serializeStoryRulesBundle(bundle: StoryRulesBundle): StoryRulesBundle {
  return {
    rules: bundle.rules,
    ...(bundle.sceneBindings?.length ? {sceneBindings: bundle.sceneBindings} : {}),
  };
}
