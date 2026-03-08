/**
 * StoryFramework -> Story 转换，用于构建 .tw 文件
 */

import type { Story, Passage, PassageLink } from '../types';
import type { StoryFramework, FrameworkScene, FrameworkLink } from '../schema/story-framework';
import { flattenScenes } from '../schema/story-framework';

function toPassageLink(link: FrameworkLink): PassageLink {
  return {
    displayText: link.displayText ?? link.target,
    passageName: link.target.trim().replace(/\s+/g, '_'),
    condition: link.condition,
  };
}

function sceneToPassage(scene: FrameworkScene): Passage {
  const id = scene.id.trim().replace(/\s+/g, '_');
  const links: PassageLink[] = (scene.links ?? []).map(toPassageLink);
  const metadata: Record<string, unknown> = {};
  if (scene.stateActions) {
    if (scene.stateActions.give) metadata.give = scene.stateActions.give;
    if (scene.stateActions.take) metadata.take = scene.stateActions.take;
    if (scene.stateActions.set) metadata.set = scene.stateActions.set;
    if (scene.stateActions.add) metadata.add = scene.stateActions.add;
    if (scene.stateActions.subtract) metadata.subtract = scene.stateActions.subtract;
    if ((scene.stateActions as Record<string, unknown>).rep)
      metadata.rep = (scene.stateActions as Record<string, unknown>).rep;
  }
  return {
    id,
    name: scene.id,
    text: scene.summary || '',
    links,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

export function frameworkToStory(fw: StoryFramework): Story {
  const scenes = flattenScenes(fw);
  const passages = new Map<string, Passage>();
  for (const s of scenes) {
    const p = sceneToPassage(s);
    passages.set(p.id, p);
  }
  const startPassageId = scenes[0]?.id?.trim().replace(/\s+/g, '_') ?? 'Start';
  const storyMetadata: Record<string, unknown> = {
    variables: fw.initialState?.variables ?? {},
    inventory: fw.initialState?.inventory ?? [],
    reputation: (fw.initialState as { reputation?: Record<string, number> })?.reputation ?? {},
  };
  return {
    title: fw.title || '未命名故事',
    startPassageId,
    passages,
    metadata: storyMetadata,
  };
}
