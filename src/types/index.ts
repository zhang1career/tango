/**
 * 文字冒险游戏框架 - 类型定义
 */

/** 单个链接（支持可选条件） */
export interface PassageLink {
  displayText: string;
  passageName: string;
  /** 条件表达式，空则始终显示 */
  condition?: string;
  /** Sugarcube setter：点击链接时执行的状态变更（再跳转） */
  linkActions?: PassageStateActions;
}

/** 单个段落/场景 */
export interface Passage {
  id: string;
  name: string;
  text: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  /** 解析后的链接 (displayText, passageName, condition?) */
  links: PassageLink[];
}

/** 游戏故事结构 */
export interface Story {
  title: string;
  startPassageId: string;
  passages: Map<string, Passage>;
  /** StoryData 中的 ifid 等元信息 */
  metadata?: Record<string, unknown>;
}

/** 游戏运行时状态（变量、物品、声誉） */
export interface RuntimeState {
  variables: Record<string, string | number | boolean>;
  inventory: string[];
  reputation: Record<string, number>;
}

/** StoryData 中可选的初始运行时状态 */
export interface InitialRuntimeState {
  variables?: Record<string, string | number | boolean>;
  inventory?: string[];
  reputation?: Record<string, number>;
}

/** 进入段落时触发的状态变更（passage metadata） */
export interface PassageStateActions {
  set?: Record<string, string | number | boolean>;
  give?: string | string[];
  take?: string | string[];
  rep?: Record<string, number>;
}
