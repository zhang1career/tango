/**
 * 功能板块配置 Schema
 * 用于功能开关与各模块的全局配置
 */

/** 战斗配置 */
export interface BattleConfig {
  /** 战斗背景音乐 URL */
  backgroundMusic?: string;
}

/** 功能板块配置 */
export interface FeaturesConfig {
  /** 战斗相关配置 */
  battle?: BattleConfig;
}
