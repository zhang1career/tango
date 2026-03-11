/**
 * 游戏场景 Schema - 独立可编辑实体
 * 与章节为多对多关系，passage 名由 (章节index + 场景id) 组成
 * 场景不含人物属性变更，仅物品与声誉
 */

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
  /** 剧情概要：发生了什么、氛围、关键台词（AI 据此生成正文） */
  summary: string;
  /** 可选的详细提示，指导 AI 写作风格 */
  hints?: string;
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
