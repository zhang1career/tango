/**
 * 级联 id 解析
 * 格式：prefix.suffix，以点分隔，如 yuanyong.b_100100、char_1773147311112.b_100
 */

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
