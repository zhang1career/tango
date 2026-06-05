/**
 * 物品 Schema
 */

export interface GameItem {
  id: string;
  name: string;
  /** 查看时的文字描述 */
  description?: string;
  /** 是否已使用（通用字段） */
  is_used?: boolean;
  /** 配图列表（支持轮播） */
  images?: string[];
  /** 物品专属背景音乐 URL（例如背包详情查看时触发） */
  backgroundMusic?: string;
}
