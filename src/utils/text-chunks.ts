/**
 * 长文本按字数分块，优先在句号、换行处切分
 */

/**
 * 将长文本按 minChars~maxChars 分块，尽量在句号、问号、感叹号、换行处切分
 * @param text 原始文本
 * @param minChars 每块最少字数
 * @param maxChars 每块最多字数
 * @returns 分块后的文本数组，若无需分块则返回单元素数组
 */
export function splitTextIntoChunks(text: string, minChars: number, maxChars: number): string[] {
  const t = text?.trim() ?? '';
  if (!t) return [''];
  if (t.length <= maxChars) return [t];

  const chunks: string[] = [];
  const splitPattern = /([。！？\n]+)/;
  let remain = t;

  while (remain.length > 0) {
    if (remain.length <= maxChars) {
      chunks.push(remain.trim());
      break;
    }

    const slice = remain.slice(0, maxChars);
    remain.slice(maxChars);
// 在 slice 内找最后一个句号/问号/感叹号/换行
    const parts = slice.split(splitPattern);
    let cutAt = slice.length;
    let found = false;

    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (splitPattern.test(part)) {
        const before = parts.slice(0, i + 1).join('');
        if (before.length >= minChars) {
          cutAt = before.length;
          found = true;
          break;
        }
      }
    }

    if (!found && slice.length >= minChars) {
      // 在 minChars 之后找第一个断句符
      const searchStart = Math.min(minChars, slice.length - 1);
      const searchRegion = slice.slice(searchStart);
      const match = searchRegion.match(splitPattern);
      if (match && match.index !== undefined) {
        cutAt = searchStart + match.index + match[0].length;
        found = true;
      }
    }

    const chunk = remain.slice(0, cutAt).trim();
    chunks.push(chunk);
    remain = remain.slice(cutAt).trimStart();
  }

  return chunks.filter(Boolean).length ? chunks : [t];
}
