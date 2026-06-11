/**
 * 功能板块配置 Schema
 * 用于功能开关与各模块的全局配置
 */

/** 战斗配置 */
export interface BattleConfig {
  /** 战斗背景音乐 URL */
  backgroundMusic?: string;
}

/** 失败支线统一配置（媒体与结局模板） */
export interface FailureBranchConfig {
  /** 统一背景音乐 URL */
  backgroundMusic?: string;
  /** 统一背景图 */
  image?: string;
  /**
   * 失败结局模板（支持占位符）
   * - {{failureEnding}}: 场景 failureEnding
   * - {{rootSceneName}}: 根主线场景名
   * - {{branchOptionId}}: 叙事边 id
   */
  template?: string;
}

/** @deprecated 使用 failureBranch */
export type BranchFailureEndingConfig = FailureBranchConfig;

/** 功能板块配置 */
export interface FeaturesConfig {
  /** 战斗相关配置 */
  battle?: BattleConfig;
  /** 失败支线统一配置 */
  failureBranch?: FailureBranchConfig;
  /** @deprecated 使用 failureBranch */
  branchFailureEnding?: FailureBranchConfig;
}
