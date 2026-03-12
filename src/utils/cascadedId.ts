/**
 * 级联 id 解析与生成
 * 格式：prefix.suffix，以点分隔；suffix 为 name_num，如 yuanyong.b_100、ch0.scene_0002.p_200
 */

/**
 * 生成级联子 ID
 * @param parentId 父 ID
 * @param subName 子级名称（如 b、p）
 * @param suffixNum 后缀数字（通常为 100、200、300…）
 * @returns 如 parentId.b_100、parentId.p_200
 */
export function toCascadedSubId(parentId: string, subName: string, suffixNum: number): string {
  return `${parentId}.${subName}_${suffixNum}`;
}

/**
 * 解析级联 id，以点号分隔
 * @param cascadedId 如 "yuanyong.b_100100"、"char_1773147311112.b_100"
 * @returns { prefix, suffix } 或 null（无点号或前缀为空）
 */
export function parseCascadedId(cascadedId: string): { prefix: string; suffix: string } | null {
  const dot = cascadedId.indexOf('.');
  if (dot < 1) return null;
  return {
    prefix: cascadedId.slice(0, dot),
    suffix: cascadedId.slice(dot + 1),
  };
}
