/**
 * story-rules.json 文件形态：规则定义 + 章节×场景绑定
 */

import type {GameRule} from './game-rule';

/** 章节内某场景的准入规则引用（与章节文件分离） */
export interface SceneRuleBinding {
  chapterId: string;
  sceneId: string;
  ruleIds?: string[];
}

export interface StoryRulesBundle {
  rules: GameRule[];
  sceneBindings?: SceneRuleBinding[];
}
