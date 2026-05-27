/**
 * Story → story_bundle.json 编译器
 */

import type {
  StoryBundle,
  StoryBundleChoice,
  StoryBundleEffect,
  StoryBundleMediaCues,
  StoryBundleNode,
  StoryBundleVarDef,
  StoryBundleVarType,
} from '../schema/story-bundle';
import {STORY_BUNDLE_FORMAT} from '../schema/story-bundle';
import type {Passage, PassageStateActions, Story} from '../types';

export interface StoryToBundleOptions {
  storyId?: string;
  version?: string;
  /** 透传 Story.metadata（characters、gameRules 等） */
  includeMetadata?: boolean;
}

function normalizeId(name: string): string {
  return name.trim().replace(/\s+/g, '_');
}

function inferVarType(value: string | number | boolean): StoryBundleVarType {
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
  return 'string';
}

function toVarDef(value: string | number | boolean): StoryBundleVarDef {
  return {type: inferVarType(value), default: value};
}

function actionsToEffects(actions?: PassageStateActions | null): StoryBundleEffect[] | undefined {
  if (!actions) return undefined;
  const effects: StoryBundleEffect[] = [];

  if (actions.set) {
    for (const [path, value] of Object.entries(actions.set)) {
      effects.push({type: 'set', path, value});
    }
  }
  if (actions.give !== undefined) {
    const items = Array.isArray(actions.give) ? actions.give : [actions.give];
    for (const item of items) effects.push({type: 'give', item});
  }
  if (actions.take !== undefined) {
    const items = Array.isArray(actions.take) ? actions.take : [actions.take];
    for (const item of items) effects.push({type: 'take', item});
  }
  if (actions.rep) {
    for (const [entity, delta] of Object.entries(actions.rep)) {
      effects.push({type: 'rep', entity, delta});
    }
  }

  return effects.length ? effects : undefined;
}

function metadataToEnterEffects(meta?: Record<string, unknown>): StoryBundleEffect[] | undefined {
  if (!meta) return undefined;
  const actions: PassageStateActions = {};
  if (meta.set && typeof meta.set === 'object') {
    actions.set = meta.set as Record<string, string | number | boolean>;
  }
  if (meta.give !== undefined) actions.give = meta.give as string | string[];
  if (meta.take !== undefined) actions.take = meta.take as string | string[];
  if (meta.rep && typeof meta.rep === 'object') {
    actions.rep = meta.rep as Record<string, number>;
  }
  return actionsToEffects(actions);
}

function metadataToMediaCues(meta?: Record<string, unknown>): StoryBundleMediaCues | undefined {
  if (!meta) return undefined;
  const cues: StoryBundleMediaCues = {};

  if (meta.openingAnimation) cues.opening_video = String(meta.openingAnimation);
  if (meta.backgroundMusic) cues.bgm = String(meta.backgroundMusic);
  if (Array.isArray(meta.images)) {
    const images = meta.images.map(String).filter(Boolean);
    if (images.length) cues.images = images;
  }
  if (Array.isArray(meta.characterIds)) {
    const ids = meta.characterIds.map(String).filter(Boolean);
    if (ids.length) cues.character_ids = ids;
  }
  if (Array.isArray(meta.eventIds)) {
    const ids = meta.eventIds.map(String).filter(Boolean);
    if (ids.length) cues.event_ids = ids;
  }

  return Object.keys(cues).length ? cues : undefined;
}

function resolveTargetId(passageName: string, passages: Map<string, Passage>): string {
  const normalized = normalizeId(passageName);
  if (passages.has(normalized)) return normalized;
  for (const [id, p] of passages) {
    if (p.name === passageName || normalizeId(p.name) === normalized) return id;
  }
  return normalized;
}

/** 简易内容校验和（djb2） */
export function storyBundleChecksum(payload: Omit<StoryBundle, 'checksum'>): string {
  let hash = 5381;
  const str = JSON.stringify(payload);
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function buildVarsSchema(story: Story): StoryBundle['vars_schema'] {
  const meta = story.metadata ?? {};
  const variables = (meta.variables as Record<string, string | number | boolean> | undefined) ?? {};
  const inventory = (meta.inventory as string[] | undefined) ?? [];
  const reputation = (meta.reputation as Record<string, number> | undefined) ?? {};

  const varsSchema: StoryBundle['vars_schema'] = {
    inventory: {default: [...inventory]},
  };

  const varDefs: Record<string, StoryBundleVarDef> = {};
  for (const [key, value] of Object.entries(variables)) {
    varDefs[key] = toVarDef(value);
  }
  if (Object.keys(varDefs).length) varsSchema.variables = varDefs;

  const repDefs: Record<string, StoryBundleVarDef> = {};
  for (const [entity, value] of Object.entries(reputation)) {
    repDefs[entity] = {type: 'int', default: value};
  }
  if (Object.keys(repDefs).length) varsSchema.reputation = repDefs;

  return varsSchema;
}

function buildNode(
  passage: Passage,
  passages: Map<string, Passage>,
  texts: Record<string, string>
): StoryBundleNode {
  const bodyKey = `${passage.id}_body`;
  texts[bodyKey] = passage.text;

  const choices: StoryBundleChoice[] = passage.links.map((link, index) => {
    const choiceId = `c_${String(index + 1).padStart(2, '0')}`;
    const textKey = `${passage.id}_${choiceId}`;
    texts[textKey] = link.displayText || link.passageName;

    const choice: StoryBundleChoice = {
      id: choiceId,
      text_key: textKey,
      target: resolveTargetId(link.passageName, passages),
    };
    if (link.condition?.trim()) choice.condition = link.condition.trim();
    const effects = actionsToEffects(link.linkActions);
    if (effects) choice.effects = effects;
    return choice;
  });

  const node: StoryBundleNode = {
    id: passage.id,
    name: passage.name,
    text_key: bodyKey,
    choices,
  };
  if (passage.tags?.length) node.tags = [...passage.tags];

  const enterEffects = metadataToEnterEffects(passage.metadata);
  if (enterEffects) node.enter_effects = enterEffects;

  const mediaCues = metadataToMediaCues(passage.metadata);
  if (mediaCues) node.media_cues = mediaCues;

  return node;
}

/** 将运行时 Story 编译为 Godot 可用的 story_bundle */
export function storyToBundle(story: Story, options: StoryToBundleOptions = {}): StoryBundle {
  const storyId = options.storyId ?? 'default';
  const version =
    options.version ??
    (typeof story.metadata?.version === 'string' ? story.metadata.version : '1.0.0');
  const includeMetadata = options.includeMetadata !== false;

  const texts: Record<string, string> = {};
  const nodes: StoryBundleNode[] = [];

  for (const passage of story.passages.values()) {
    nodes.push(buildNode(passage, story.passages, texts));
  }

  nodes.sort((a, b) => a.id.localeCompare(b.id));

  const entryNode = story.passages.has(story.startPassageId)
    ? story.startPassageId
    : normalizeId(story.startPassageId);

  const base: Omit<StoryBundle, 'checksum'> = {
    format: STORY_BUNDLE_FORMAT,
    story_id: storyId,
    version,
    title: story.title,
    entry_node: entryNode,
    generated_at: new Date().toISOString(),
    vars_schema: buildVarsSchema(story),
    texts,
    nodes,
  };

  if (includeMetadata && story.metadata && Object.keys(story.metadata).length) {
    const {variables, inventory, reputation, start, format, ...rest} = story.metadata as Record<
      string,
      unknown
    >;
    void variables;
    void inventory;
    void reputation;
    void start;
    void format;
    if (Object.keys(rest).length) base.metadata = rest;
  }

  return {
    ...base,
    checksum: storyBundleChecksum(base),
  };
}
