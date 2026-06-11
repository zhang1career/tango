/**
 * JSON 局部 PATCH（点路径，如 chapters.0.narrativeGoal）
 */

export type JsonPatchOp = {op: 'set'; path: string; value: unknown};

function parsePath(path: string): string[] {
  const parts: string[] = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    parts.push(m[1] ?? m[2]!);
  }
  return parts;
}

export function applyJsonPatches<T>(doc: T, patches: JsonPatchOp[]): T {
  const next = structuredClone(doc) as T;
  for (const patch of patches) {
    if (patch.op !== 'set') throw new Error(`unsupported op: ${patch.op}`);
    const keys = parsePath(patch.path);
    if (keys.length === 0) throw new Error('empty patch path');
    let cur: unknown = next;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]!;
      if (cur == null || typeof cur !== 'object') throw new Error(`invalid path: ${patch.path}`);
      cur = (cur as Record<string, unknown>)[k];
    }
    if (cur == null || typeof cur !== 'object') throw new Error(`invalid path: ${patch.path}`);
    (cur as Record<string, unknown>)[keys[keys.length - 1]!] = patch.value;
  }
  return next;
}

/** story-scenes.json：按 sceneId 设置字段 */
export function applyScenePatches(
  scenes: Array<Record<string, unknown>>,
  patches: Array<{sceneId: string; path: string; value: unknown}>
): typeof scenes {
  const next = structuredClone(scenes);
  for (const patch of patches) {
    const idx = next.findIndex((s) => s.id === patch.sceneId);
    if (idx < 0) throw new Error(`scene not found: ${patch.sceneId}`);
    const updated = applyJsonPatches(next[idx], [{op: 'set', path: patch.path, value: patch.value}]);
    next[idx] = updated;
  }
  return next;
}

export type GamePatchResource =
  | 'story-fm'
  | 'story-outline'
  | 'story-scenes'
  | 'story-foreshadowing'
  | 'story-canon';

/** 服务端 / 中间件：对游戏 JSON 资源应用 PATCH body */
export function applyResourcePatch(
  resource: GamePatchResource,
  current: unknown,
  body: {patches?: JsonPatchOp[]; scenePatches?: Array<{sceneId: string; path: string; value: unknown}>}
): unknown {
  if (resource === 'story-scenes') {
    if (!Array.isArray(current)) throw new Error('story-scenes must be array');
    if (!body.scenePatches?.length) throw new Error('scenePatches required');
    return applyScenePatches(current as Array<Record<string, unknown>>, body.scenePatches);
  }
  if (!body.patches?.length) throw new Error('patches required');
  const doc = current && typeof current === 'object' ? current : {};
  return applyJsonPatches(doc, body.patches);
}
