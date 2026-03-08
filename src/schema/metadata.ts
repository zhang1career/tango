/**
 * 元信息 Schema - 人物属性定义（变量名称、类型、取值范围）
 * 保存到预设位置，供属性编辑卡使用
 */

export type AttributeType = 'string' | 'number' | 'boolean';

/** 人物属性定义 - 支持二级维度：id 为一级，subId 为二级（可选） */
export interface CharacterAttributeDef {
  /** 一级维度 id，如 reputation、experience。同类型下可重复 */
  id: string;
  /** 二级维度 id，可选。如 erzhurong。有 subId 时与 id 组成复合键 id_subId */
  subId?: string;
  /** 变量名称（显示用），如 声誉-尔朱荣 */
  name: string;
  /** 变量类型 */
  type: AttributeType;
  /** 取值范围（number 时为 "min,max"，如 "0,100"） */
  valueRange?: string;
}

/** 获取属性的存储/引用键：有 subId 时为 id_subId，否则为 id */
export function getAttrKey(def: CharacterAttributeDef): string {
  return def.subId ? `${def.id}_${def.subId}` : def.id;
}

/** 元信息 */
export interface GameMetadata {
  /** 人物属性列表 */
  characterAttributes: CharacterAttributeDef[];
}
