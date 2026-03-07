/**
 * 状态变更 - 共享于场景、地图、人物、事件
 * 属性：对人物属性中各项的操作（set/add/subtract）
 * 物品：give/take
 */

export interface FrameworkStateActions {
  /** 设置属性值 */
  set?: Record<string, string | number | boolean>;
  /** 增加数值型属性 */
  add?: Record<string, number>;
  /** 减少数值型属性 */
  subtract?: Record<string, number>;
  /** 添加物品 */
  give?: string | string[];
  /** 移除物品 */
  take?: string | string[];
}
