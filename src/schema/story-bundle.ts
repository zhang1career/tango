/**
 * story_bundle.json — Godot 运行时剧情包 Schema
 * 由 Story / Twee 编译产出，供客户端加载分支、变量与多媒体 cue
 */

export const STORY_BUNDLE_FORMAT = 'story-bundle/v1' as const;

export type StoryBundleVarType = 'bool' | 'int' | 'float' | 'string';

export interface StoryBundleVarDef {
  type: StoryBundleVarType;
  default: string | number | boolean;
  min?: number;
  max?: number;
}

export interface StoryBundleInventoryDef {
  default: string[];
}

export type StoryBundleEffect =
  | { type: 'set'; path: string; value: string | number | boolean }
  | { type: 'give'; item: string }
  | { type: 'take'; item: string }
  | { type: 'rep'; entity: string; delta: number };

export interface StoryBundleMediaCues {
  opening_video?: string;
  images?: string[];
  bgm?: string;
  character_ids?: string[];
  event_ids?: string[];
}

export interface StoryBundleChoice {
  id: string;
  text_key: string;
  target: string;
  condition?: string;
  effects?: StoryBundleEffect[];
}

export interface StoryBundleNode {
  id: string;
  /** 原始 passage 名称（Twine 展示用） */
  name: string;
  text_key: string;
  tags?: string[];
  enter_effects?: StoryBundleEffect[];
  media_cues?: StoryBundleMediaCues;
  choices: StoryBundleChoice[];
}

export interface StoryBundleVarsSchema {
  variables?: Record<string, StoryBundleVarDef>;
  inventory?: StoryBundleInventoryDef;
  reputation?: Record<string, StoryBundleVarDef>;
}

/** Godot 运行时加载的完整剧情包 */
export interface StoryBundle {
  format: typeof STORY_BUNDLE_FORMAT;
  story_id: string;
  version: string;
  title: string;
  entry_node: string;
  generated_at: string;
  checksum: string;
  vars_schema: StoryBundleVarsSchema;
  /** text_key → 正文或选项文案 */
  texts: Record<string, string>;
  nodes: StoryBundleNode[];
  /** 透传 StoryData 中的角色、规则等（Godot 侧可选使用） */
  metadata?: Record<string, unknown>;
}
