/**
 * 游戏地图 Schema - 地点与连接
 * 用于开发时规划空间结构，地图节点可带规则引擎效果
 */

import type { FrameworkStateActions } from './state-actions';

/** 地图节点（地点） */
export interface MapNode {
  id: string;
  /** 地点名称 */
  name: string;
  /** 画布上的相对位置 x */
  x?: number;
  /** 画布上的相对位置 y */
  y?: number;
  /** 规则：进入时由规则引擎求值，影响玩家 */
  rules?: string[];
  /** 进入该地点时的状态变更 */
  onEnter?: FrameworkStateActions;
  /** 该地点的物品（可拾取/可交互） */
  items?: string[];
  /** 该地点的人物 id 列表（非玩家控制时按脚本行动） */
  characterIds?: string[];
  /** @deprecated 使用 characterIds */
  npcs?: string[];
}

/** 地图连边（地点间的连接） */
export interface MapEdge {
  from: string;
  to: string;
  /** 选项文案 */
  displayText?: string;
  /** 显示此连接的条件表达式 */
  condition?: string;
}

/** 完整地图 */
export interface GameMap {
  id: string;
  name: string;
  nodes: MapNode[];
  edges: MapEdge[];
}
