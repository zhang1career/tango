/**
 * story-fm 之外的列表数据加载（场景、地图、规则等）
 */

import {
  getCharactersFetchUrl,
  getScenesFetchUrl,
  getMapsFetchUrl,
  getEventsFetchUrl,
  getItemsFetchUrl,
  getMetadataFetchUrl,
  getRulesFetchUrl,
  getFeaturesFetchUrl,
  getStoryFmFetchUrl,
} from '@/config';
import type {StoryFramework} from '../schema/story-framework';
import {fromPersistedFramework, migrateFramework} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import type {GameCharacter} from '../schema/game-character';
import type {GameMap} from '../schema/game-map';
import type {GameEvent} from '../schema/game-event';
import type {GameItem} from '../schema/game-item';
import type {GameMetadata} from '../schema/metadata';
import {parseStoryRulesFile} from '../utils/parse-story-rules';
import {normalizeFeaturesConfig} from '../utils/normalize-features';

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export async function fetchFrameworkListData(gameId: string): Promise<Partial<StoryFramework>> {
  const merged: Partial<StoryFramework> = {};
  const apis = [
    {url: getCharactersFetchUrl(gameId), parse: (d: unknown) => (Array.isArray(d) ? d : []) as GameCharacter[]},
    {url: getScenesFetchUrl(gameId), parse: (d: unknown) => (Array.isArray(d) ? d : []) as GameScene[]},
    {url: getMapsFetchUrl(gameId), parse: (d: unknown) => (Array.isArray(d) ? d : []) as GameMap[]},
    {url: getEventsFetchUrl(gameId), parse: (d: unknown) => (Array.isArray(d) ? d : []) as GameEvent[]},
    {url: getItemsFetchUrl(gameId), parse: (d: unknown) => (Array.isArray(d) ? d : []) as GameItem[]},
    {
      url: getMetadataFetchUrl(gameId),
      parse: (d: unknown) => {
        const m = d as {characterAttributes?: unknown};
        return m?.characterAttributes ? ({characterAttributes: m.characterAttributes} as GameMetadata) : undefined;
      },
    },
    {
      url: getRulesFetchUrl(gameId),
      parse: (d: unknown) => parseStoryRulesFile(d),
    },
    {
      url: getFeaturesFetchUrl(gameId),
      parse: (d: unknown) =>
        d && typeof d === 'object' && !Array.isArray(d)
          ? normalizeFeaturesConfig(d as import('../schema/features').FeaturesConfig)
          : undefined,
    },
  ];
  const keys: (keyof StoryFramework)[] = [
    'characters',
    'scenes',
    'maps',
    'events',
    'items',
    'metadata',
    'gameRules',
    'features',
  ];
  for (let i = 0; i < apis.length; i++) {
    const {url, parse} = apis[i];
    const key = keys[i];
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const parsed = parse(data);
      if (key === 'gameRules' && parsed && typeof parsed === 'object' && 'rules' in (parsed as object)) {
        const bundle = parsed as ReturnType<typeof parseStoryRulesFile>;
        merged.gameRules = bundle.rules;
        merged.sceneBindings = bundle.sceneBindings ?? [];
      } else if (parsed !== undefined && parsed !== null) {
        (merged as Record<string, unknown>)[key as string] = parsed;
      }
    } catch {
      // ignore
    }
  }
  return merged;
}

export async function loadFrameworkWithListData(gameId: string): Promise<StoryFramework | null> {
  const storyRes = await fetch(getStoryFmFetchUrl(gameId));
  if (!storyRes.ok) {
    if (storyRes.status === 404) return null;
    throw new Error(`读取剧情框架失败: ${storyRes.status}`);
  }
  const parsed = (await storyRes.json()) as Record<string, unknown>;
  if (!isRecord(parsed)) throw new Error('剧情框架格式错误');
  if (!parsed.title) parsed.title = '未命名故事';
  if (!Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
    parsed.chapters = [
      {id: 'ch0', title: '第一章', availableSceneIds: [], narrativeEdges: [], transitions: []},
    ];
  }
  migrateFramework(parsed as unknown as StoryFramework);
  const fw = fromPersistedFramework(parsed);
  const listData = await fetchFrameworkListData(gameId);
  return {...fw, ...listData};
}

export async function preloadFrameworkListData(
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void,
  gameId: string
): Promise<void> {
  const merged = await fetchFrameworkListData(gameId);
  if (Object.keys(merged).length > 0) {
    updateFw((d) => ({...d, ...merged}));
  }
}

/** 将内存中的列表数据（场景、地图等）合并到已落盘的 story-fm 骨架上 */
export function mergeRuntimeFrameworkListData(
  base: StoryFramework,
  runtime: StoryFramework
): StoryFramework {
  return {
    ...base,
    scenes: runtime.scenes ?? base.scenes,
    characters: runtime.characters ?? base.characters,
    maps: runtime.maps ?? base.maps,
    events: runtime.events ?? base.events,
    items: runtime.items ?? base.items,
    metadata: runtime.metadata ?? base.metadata,
    gameRules: runtime.gameRules ?? base.gameRules,
    sceneBindings: runtime.sceneBindings ?? base.sceneBindings,
    features: runtime.features ?? base.features,
  };
}
