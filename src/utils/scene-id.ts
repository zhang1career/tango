/**
 * 从 passage 解析当前场景 id
 * 优先 metadata.sceneId，否则从 passage id（ch{N}.{sceneId}[.p_xxx]）提取
 */

const PASSAGE_SCENE_ID_RE = /^ch\d+\.([^.\s]+)/;

export function resolveSceneIdFromPassage(
  passage: { id: string; metadata?: Record<string, unknown> } | null | undefined
): string | undefined {
  if (!passage) return undefined;
  const fromMeta = passage.metadata?.sceneId;
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim();
  const match = passage.id.match(PASSAGE_SCENE_ID_RE);
  return match?.[1];
}
