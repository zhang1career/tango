/**
 * 游戏场景 Schema - 独立可编辑实体（纯内容，路由在章节图定义）
 */

export interface ScenePassageRawBlock {
  type: 'raw';
  text: string;
}

export type AiBlockPriority = 'low' | 'medium' | 'high';

export interface ScenePassageAiBlock {
  type: 'ai';
  summary: string;
  wordCount: number;
  emotion?: string;
  anchors?: string[];
  forbidden?: string[];
  perspective?: string;
  priority?: AiBlockPriority;
  style?: string;
  pacing?: string;
  voice?: string;
  constraints?: string;
  characterIds?: string[];
  generatedText?: string;
}

export type ScenePassageBlock = ScenePassageRawBlock | ScenePassageAiBlock;

export interface SceneCharacterOverride {
  description?: string;
  attributes?: Record<string, string | number | boolean>;
  inventory?: string[];
  behaviorLibrary?: import('./game-behavior').GameBehavior[];
}

export interface SceneStateActions {
  give?: string | string[];
  take?: string | string[];
  rep?: Record<string, number>;
}

/** 场景定义 */
export interface GameScene {
  id: string;
  name: string;
  passageBlocks: ScenePassageBlock[];
  stateActions?: SceneStateActions;
  mapNodeId?: string;
  characterIds?: string[];
  counterpartCharacterIds?: string[];
  characterOverrides?: Record<string, SceneCharacterOverride>;
  eventIds?: string[];
  ruleIds?: string[];
  conditions?: string;
  is_used?: boolean;
  openingAnimation?: string;
  /** 过场动画创作参考（仅编辑器用，不进运行时 metadata） */
  openingAnimationPrompt?: string;
  images?: string[];
  backgroundMusic?: string;
  synthesizedBgm?: string;
  messages?: string[];
  /** 是否为失败支线场景（决定失败模板、统一媒体预设等） */
  isFailure?: boolean;
  /** 失败结局描述（套入 story-features.failureBranch 模板） */
  failureEnding?: string;
  /** 可选，覆盖末端附加文案 */
  branchEndingText?: string;
}
