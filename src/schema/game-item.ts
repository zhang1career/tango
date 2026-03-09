/**
 * 物品 Schema
 */

export interface GameItem {
  id: string;
  name: string;
  /** 是否已使用（通用字段） */
  is_used?: boolean;
}
