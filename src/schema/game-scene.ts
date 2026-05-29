/**
 * 游戏场景 Schema - 独立可编辑实体
 * 与章节为多对多关系，passage 名由 (章节index + 场景id) 组成
 * 场景不含人物属性变更，仅物品与声誉
 */

export interface ScenePassageRawBlock {
  type: 'raw';
  /** 直接透传到 story.tw passage 的正文片段 */
  text: string;
}

export interface ScenePassageAiBlock {
  type: 'ai';
  /** AI 扩写依据（块级） */
  summary: string;
  /** 可选：块级写作提示 */
  hints?: string;
  /** 可选：块级字数要求 */
  wordCount?: number;
}

export type ScenePassageBlock = ScenePassageRawBlock | ScenePassageAiBlock;

/** 场景进入时的状态变更（不含人物属性） */
export interface SceneStateActions {
  /** 添加物品 */
  give?: string | string[];
  /** 移除物品 */
  take?: string | string[];
  /** 声誉变更 */
  rep?: Record<string, number>;
}

/** 场景定义 */
export interface GameScene {
  id: string;
  /** 展示用名称 */
  name: string;
  /** passage 正文块（有序），按数组顺序混排：raw 透传 + ai 生成 */
  passageBlocks: ScenePassageBlock[];
  /** 进入该场景时的状态变更（仅物品、声誉） */
  stateActions?: SceneStateActions;
  /** 关联的地图节点 id */
  mapNodeId?: string;
  /** 该场景出场的人物 id 列表 */
  characterIds?: string[];
  /** 该场景关联的事件 id 列表 */
  eventIds?: string[];
  /** 规则 id 列表 */
  ruleIds?: string[];
  /** 条件（单行表达式，准入判断时先检查；不含回写逻辑） */
  conditions?: string;
  /** 是否已使用（通用字段，用于 only_once 等规则） */
  is_used?: boolean;
  /** 开场动画 URL（视频） */
  openingAnimation?: string;
  /** 配图列表（支持轮播） */
  images?: string[];
  /** 背景音乐 URL */
  backgroundMusic?: string;
}
