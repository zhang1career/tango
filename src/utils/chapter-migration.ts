/**
 * 将旧版 sceneEntries + scene.branchOptions 迁移为章节图结构
 */

import type {ChapterNarrativeEdge, FrameworkChapter, SceneEntry} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import type {SceneRuleBinding} from '../schema/story-rules-bundle';
import type {ChapterSceneMeta} from './chapter-scene';

/** 迁移前场景形态（路由字段已迁到章节图） */
interface LegacySceneBranchOption {
  id: string;
  displayText: string;
  failureEnding: string;
  branchSceneIds: string[];
  condition?: string;
  continueDisplayTexts?: string[];
  returnDisplayText?: string;
}

type LegacyGameScene = GameScene & {
  branchOptions?: LegacySceneBranchOption[];
  mainlineLinkDisplayText?: string;
  branchFailureEnding?: boolean;
  branchFailureEndingText?: string;
};

function buildBranchOwners(
  sceneIds: string[],
  sceneMap: Map<string, LegacyGameScene>
): Map<string, {rootSceneId: string; option: LegacySceneBranchOption; optionIndex: number}> {
  const owners = new Map<
    string,
    {rootSceneId: string; option: LegacySceneBranchOption; optionIndex: number}
  >();
  for (const sceneId of sceneIds) {
    const root = sceneMap.get(sceneId);
    if (!root) continue;
    (root.branchOptions ?? []).filter(Boolean).forEach((option, oi) => {
      for (const bid of option.branchSceneIds ?? []) {
        const id = bid?.trim();
        if (id) owners.set(id, {rootSceneId: root.id, option, optionIndex: oi});
      }
    });
  }
  return owners;
}

function edgeId(from: string, to: string, suffix = ''): string {
  return `e_${from}_to_${to}${suffix ? `_${suffix}` : ''}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

export interface MigrateChapterResult {
  chapter: FrameworkChapter;
  sceneBindings: SceneRuleBinding[];
}

export function migrateChapterFromLegacy(
  ch: FrameworkChapter,
  scenes: GameScene[]
): MigrateChapterResult {
  const sceneMap = new Map(scenes.map((s) => [s.id, s as LegacyGameScene]));
  const entries = ch.sceneEntries ?? [];
  const sceneIds = entries.map((e) => e.sceneId);
  const sceneBindings: SceneRuleBinding[] = entries
    .filter((e) => (e.ruleIds ?? []).length > 0)
    .map((e) => ({
      chapterId: ch.id,
      sceneId: e.sceneId,
      ruleIds: e.ruleIds,
    }));

  const sceneMeta: Record<string, ChapterSceneMeta> = {};
  for (const e of entries) {
    if (e.compiledFingerprint || e.routingFingerprint) {
      sceneMeta[e.sceneId] = {
        compiledFingerprint: e.compiledFingerprint,
        routingFingerprint: e.routingFingerprint,
      };
    }
  }

  const branchOwners = buildBranchOwners(sceneIds, sceneMap);
  const mainlineIds = sceneIds.filter((id) => !branchOwners.has(id));

  const narrativeGraph: Record<string, boolean> = {};
  for (const id of mainlineIds) {
    narrativeGraph[id] = true;
  }

  const narrativeEdges: ChapterNarrativeEdge[] = [];

  for (let i = 0; i < mainlineIds.length - 1; i++) {
    const from = mainlineIds[i]!;
    const to = mainlineIds[i + 1]!;
    const fromScene = sceneMap.get(from);
    narrativeEdges.push({
      id: edgeId(from, to, 'main'),
      fromSceneId: from,
      toSceneId: to,
      displayText: fromScene?.mainlineLinkDisplayText?.trim() || '继续',
    });
  }

  for (const rootId of mainlineIds) {
    const root = sceneMap.get(rootId);
    if (!root) continue;
    (root.branchOptions ?? []).filter(Boolean).forEach((option, oi) => {
      const branchIds = (option.branchSceneIds ?? []).map((id) => id?.trim()).filter(Boolean);
      if (branchIds.length === 0) return;
      const label = option.id || `branch_${oi}`;
      narrativeEdges.push({
        id: edgeId(rootId, branchIds[0]!, label),
        fromSceneId: rootId,
        toSceneId: branchIds[0]!,
        displayText: option.displayText?.trim() || '支线',
        condition: option.condition?.trim() || undefined,
        isBranch: true,
      });
      for (let bi = 0; bi < branchIds.length - 1; bi++) {
        const cont = option.continueDisplayTexts?.[bi]?.trim() || '继续';
        narrativeEdges.push({
          id: edgeId(branchIds[bi]!, branchIds[bi + 1]!, label),
          fromSceneId: branchIds[bi]!,
          toSceneId: branchIds[bi + 1]!,
          displayText: cont,
          isBranch: true,
        });
      }
      const lastBranch = branchIds[branchIds.length - 1]!;
      const legacyEndingText = sceneMap.get(lastBranch)?.branchFailureEndingText?.trim();
      const failureEnding = option.failureEnding?.trim();
      if (failureEnding || legacyEndingText) {
        const idx = scenes.findIndex((s) => s.id === lastBranch);
        if (idx >= 0) {
          scenes[idx] = {
            ...scenes[idx]!,
            isFailure: true,
            ...(failureEnding ? {failureEnding} : {}),
            ...(legacyEndingText ? {branchEndingText: legacyEndingText} : {}),
          };
        }
      }
      narrativeEdges.push({
        id: edgeId(lastBranch, rootId, `${label}_return`),
        fromSceneId: lastBranch,
        toSceneId: rootId,
        displayText: option.returnDisplayText?.trim() || '返回主线',
        isBranch: true,
      });
    });
  }

  const {
    sceneEntries: _se,
    startMapNodeId: _start,
    endMapNodeId: _end,
    ...rest
  } = ch;

  return {
    chapter: {
      ...rest,
      availableSceneIds: sceneIds,
      ...(Object.keys(narrativeGraph).length ? {narrativeGraph} : {}),
      startSceneId: mainlineIds[0],
      narrativeEdges,
      transitions: [],
      sceneMeta: Object.keys(sceneMeta).length ? sceneMeta : undefined,
    },
    sceneBindings,
  };
}

export function stripSceneRoutingFields(scene: LegacyGameScene): GameScene {
  const {
    branchOptions: _bo,
    mainlineLinkDisplayText: _ml,
    branchFailureEnding: _bf,
    branchFailureEndingText: legacyEndingText,
    ...rest
  } = scene;
  const out: GameScene = rest;
  if (legacyEndingText?.trim()) {
    out.branchEndingText = legacyEndingText.trim();
    out.isFailure = true;
  }
  return out;
}
