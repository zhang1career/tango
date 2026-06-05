/**
 * 场景展示标题与 passage id/name 分离：
 * - 分页子页 id 为 ch0.scene_01.p_100 等技术 id
 * - 展示标题来自 metadata.sceneTitle 或同 sceneId 的主 passage
 */

import type {Passage, Story} from '@/types';

const TECHNICAL_ID_LOOSE_RE = /^ch\d+\.[a-zA-Z0-9_-]+(?:\.p_\d+)?$/;
const PAGE_SUFFIX_RE = /\.p_\d+$/;

export function isTechnicalPassageId(id: string): boolean {
  return TECHNICAL_ID_LOOSE_RE.test(id.trim());
}

function readNonTechnicalTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || isTechnicalPassageId(trimmed)) return undefined;
  return trimmed;
}

/** 同一场景的主 passage（非 .p_ 分页子页） */
function findSceneRootPassage(story: Story, sceneId: string): Passage | undefined {
  for (const [, p] of story.passages) {
    if (p.metadata?.sceneId !== sceneId) continue;
    if (!PAGE_SUFFIX_RE.test(p.id)) return p;
  }
  for (const [, p] of story.passages) {
    if (p.metadata?.sceneId === sceneId) return p;
  }
  return undefined;
}

/** 解析当前 passage 在 UI 中应展示的场景标题 */
export function resolvePassageDisplayTitle(
  story: Story,
  passage: Passage | null | undefined
): string {
  if (!passage) return '';

  const fromMeta = readNonTechnicalTitle(passage.metadata?.sceneTitle);
  if (fromMeta) return fromMeta;

  const fromName = readNonTechnicalTitle(passage.name);
  if (fromName) return fromName;

  const sceneId = passage.metadata?.sceneId;
  if (typeof sceneId === 'string' && sceneId.trim()) {
    const root = findSceneRootPassage(story, sceneId.trim());
    if (root) {
      const rootTitle =
        readNonTechnicalTitle(root.metadata?.sceneTitle) ??
        readNonTechnicalTitle(root.name);
      if (rootTitle) return rootTitle;
    }
  }

  const baseId = passage.id.replace(PAGE_SUFFIX_RE, '');
  if (baseId !== passage.id) {
    const base = story.passages.get(baseId);
    if (base) {
      const baseTitle =
        readNonTechnicalTitle(base.metadata?.sceneTitle) ??
        readNonTechnicalTitle(base.name);
      if (baseTitle) return baseTitle;
    }
  }

  return '';
}

/** 从 passage 推断应写入 metadata.sceneTitle 的展示标题 */
export function inferSceneTitleForPassage(passage: Passage): string | undefined {
  return (
    readNonTechnicalTitle(passage.metadata?.sceneTitle) ??
    readNonTechnicalTitle(passage.name)
  );
}
