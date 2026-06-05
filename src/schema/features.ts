/**
 * 功能板块配置 Schema
 * 用于功能开关与各模块的全局配置
 */

/** 战斗配置 */
export interface BattleConfig {
  /** 战斗背景音乐 URL */
  backgroundMusic?: string;
}

/** 支线失败结局统一配置 */
export interface BranchFailureEndingConfig {
  /** 统一背景音乐 URL */
  backgroundMusic?: string;
  /** 统一背景图 */
  image?: string;
  /**
   * 失败结局模板（支持占位符）
   * - {{failureEnding}}: branchOptions.failureEnding
   * - {{rootSceneName}}: 根主线场景名
   * - {{branchOptionId}}: 分支选项 id
   */
  template?: string;
}

/** 功能板块配置 */
export interface FeaturesConfig {
  /** 战斗相关配置 */
  battle?: BattleConfig;
  /** 支线失败结局统一配置 */
  branchFailureEnding?: BranchFailureEndingConfig;
}
