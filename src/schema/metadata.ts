/**
 * 元信息 Schema - 人物属性定义（变量名称、类型、取值范围）
 * 保存到预设位置，供属性编辑卡使用
 */

export type AttributeType = 'string' | 'number' | 'boolean';

/** 人物属性定义 */
export interface CharacterAttributeDef {
  id: string;
  /** 变量名称（显示用，也作 key） */
  name: string;
  /** 变量类型 */
  type: AttributeType;
  /** 取值范围（number 时为 "min,max"，如 "0,100"） */
  valueRange?: string;
}

/** 元信息 */
export interface GameMetadata {
  /** 人物属性列表 */
  characterAttributes: CharacterAttributeDef[];
}
