#!/usr/bin/env node
/**
 * 迁移章节图结构：
 * - story-fm.json: sceneEntries → availableSceneIds + narrativeEdges + ...
 * - story-scenes.json: 移除 branchOptions / mainlineLinkDisplayText / branchFailure*
 * - story-rules.json: 数组 → { rules, sceneBindings }
 *
 * 用法: node scripts/migrate-chapter-graph.mjs [gameId]
 */
import {readFileSync, writeFileSync, readdirSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = resolve(root, 'assets/games');

function edgeId(from, to, suffix = '') {
  return `e_${from}_to_${to}${suffix ? `_${suffix}` : ''}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

function buildBranchOwners(sceneIds, sceneMap) {
  const owners = new Map();
  for (const sceneId of sceneIds) {
    const root = sceneMap.get(sceneId);
    if (!root) continue;
    for (const [oi, option] of (root.branchOptions ?? []).entries()) {
      if (!option) continue;
      for (const bid of option.branchSceneIds ?? []) {
        const id = bid?.trim();
        if (id) owners.set(id, {rootSceneId: root.id, option, optionIndex: oi});
      }
    }
  }
  return owners;
}

function migrateChapter(ch, sceneMap) {
  const entries = ch.sceneEntries ?? [];
  const sceneIds = entries.map((e) => e.sceneId);
  const sceneBindings = entries
    .filter((e) => (e.ruleIds ?? []).length > 0)
    .map((e) => ({chapterId: ch.id, sceneId: e.sceneId, ruleIds: e.ruleIds}));

  const sceneMeta = {};
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
  const narrativeGraph = {};
  for (const id of mainlineIds) {
    narrativeGraph[id] = true;
  }

  const narrativeEdges = [];
  for (let i = 0; i < mainlineIds.length - 1; i++) {
    const from = mainlineIds[i];
    const to = mainlineIds[i + 1];
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
    for (const [oi, option] of (root.branchOptions ?? []).entries()) {
      if (!option) continue;
      const branchIds = (option.branchSceneIds ?? []).map((id) => id?.trim()).filter(Boolean);
      if (!branchIds.length) continue;
      const label = option.id || `branch_${oi}`;
      narrativeEdges.push({
        id: edgeId(rootId, branchIds[0], label),
        fromSceneId: rootId,
        toSceneId: branchIds[0],
        displayText: option.displayText?.trim() || '支线',
        condition: option.condition?.trim() || undefined,
        isBranch: true,
      });
      for (let bi = 0; bi < branchIds.length - 1; bi++) {
        narrativeEdges.push({
          id: edgeId(branchIds[bi], branchIds[bi + 1], label),
          fromSceneId: branchIds[bi],
          toSceneId: branchIds[bi + 1],
          displayText: option.continueDisplayTexts?.[bi]?.trim() || '继续',
          isBranch: true,
        });
      }
      const lastBranch = branchIds[branchIds.length - 1];
      const legacyEndingText = sceneMap.get(lastBranch)?.branchFailureEndingText?.trim();
      const failureEnding = option.failureEnding?.trim();
      if (failureEnding || legacyEndingText) {
        const idx = scenes.findIndex((s) => s.id === lastBranch);
        if (idx >= 0) {
          scenes[idx] = {
            ...scenes[idx],
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
    }
  }

  const endSceneIds = mainlineIds.length ? [mainlineIds[mainlineIds.length - 1]] : [];
  const {sceneEntries: _se, startMapNodeId: _s, endMapNodeId: _e, ...rest} = ch;
  return {
    chapter: {
      ...rest,
      availableSceneIds: sceneIds,
      ...(Object.keys(narrativeGraph).length ? {narrativeGraph} : {}),
      startSceneId: mainlineIds[0],
      endSceneIds,
      narrativeEdges,
      transitions: ch.transitions ?? [],
      ...(Object.keys(sceneMeta).length ? {sceneMeta} : {}),
    },
    sceneBindings,
  };
}

function stripScene(scene) {
  const {
    branchOptions: _bo,
    mainlineLinkDisplayText: _ml,
    branchFailureEnding: _bf,
    branchFailureEndingText: legacyEndingText,
    ...rest
  } = scene;
  const out = {...rest};
  if (legacyEndingText?.trim()) {
    out.branchEndingText = legacyEndingText.trim();
    out.isFailure = true;
  }
  return out;
}

function migrateRules(rulesPath, allBindings) {
  if (!existsSync(rulesPath)) return;
  const raw = JSON.parse(readFileSync(rulesPath, 'utf-8'));
  let rules = [];
  let existingBindings = [];
  if (Array.isArray(raw)) rules = raw;
  else if (raw && typeof raw === 'object') {
    rules = Array.isArray(raw.rules) ? raw.rules : [];
    existingBindings = Array.isArray(raw.sceneBindings) ? raw.sceneBindings : [];
  }
  const mergedBindings = [...existingBindings];
  for (const b of allBindings) {
    const idx = mergedBindings.findIndex(
      (x) => x.chapterId === b.chapterId && x.sceneId === b.sceneId
    );
    if (idx >= 0) mergedBindings[idx] = b;
    else mergedBindings.push(b);
  }
  const out = {rules};
  if (mergedBindings.length) out.sceneBindings = mergedBindings;
  writeFileSync(rulesPath, `${JSON.stringify(out, null, 2)}\n`, 'utf-8');
  console.log(`  migrated ${rulesPath}`);
}

function migrateRoutingFields(ch) {
  if (ch.narrativeGraph) {
    const {sceneModes: _sm, narrativeRouting: _nr, openWorld: _ow, ...rest} = ch;
    return rest;
  }
  const pool = ch.availableSceneIds ?? [];
  const narrativeGraph = {};
  if (ch.openWorld) {
    for (const sid of pool) {
      if (ch.openWorld[sid] !== true) narrativeGraph[sid] = true;
    }
  } else if (ch.narrativeRouting) {
    for (const sid of pool) {
      if (ch.narrativeRouting[sid] === true) narrativeGraph[sid] = true;
    }
  } else if (ch.sceneModes) {
    for (const [sid, mode] of Object.entries(ch.sceneModes)) {
      if (mode === 'narrative') narrativeGraph[sid] = true;
    }
  } else {
    return ch;
  }
  const {sceneModes: _sm, narrativeRouting: _nr, openWorld: _ow, ...rest} = ch;
  return {
    ...rest,
    ...(Object.keys(narrativeGraph).length ? {narrativeGraph} : {}),
  };
}

function migrateGame(gameId) {
  const base = resolve(gamesDir, gameId);
  const fmPath = resolve(base, 'story-fm.json');
  const scenesPath = resolve(base, 'story-scenes.json');
  if (!existsSync(fmPath)) {
    console.warn(`skip ${gameId}: no story-fm.json`);
    return;
  }

  const fm = JSON.parse(readFileSync(fmPath, 'utf-8'));
  const scenes = existsSync(scenesPath)
    ? JSON.parse(readFileSync(scenesPath, 'utf-8'))
    : [];
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));
  const allBindings = [];

  fm.chapters = (fm.chapters ?? []).map((ch) => {
    if (ch.availableSceneIds?.length) return migrateRoutingFields(ch);
    const {chapter, sceneBindings} = migrateChapter(ch, sceneMap);
    allBindings.push(...sceneBindings);
    return migrateRoutingFields(chapter);
  });

  writeFileSync(fmPath, `${JSON.stringify(fm, null, 2)}\n`, 'utf-8');
  console.log(`  migrated ${fmPath}`);

  if (existsSync(scenesPath)) {
    const stripped = scenes.map(stripScene);
    writeFileSync(scenesPath, `${JSON.stringify(stripped, null, 2)}\n`, 'utf-8');
    console.log(`  migrated ${scenesPath}`);
  }

  migrateRules(resolve(base, 'story-rules.json'), allBindings);
  console.log(`done ${gameId}`);
}

const arg = process.argv[2];
if (arg) {
  migrateGame(arg);
} else {
  for (const ent of readdirSync(gamesDir, {withFileTypes: true})) {
    if (ent.isDirectory() && !ent.name.startsWith('.')) migrateGame(ent.name);
  }
}
