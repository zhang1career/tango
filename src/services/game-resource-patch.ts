import {
  getCanonFetchUrl,
  getForeshadowingFetchUrl,
  getOutlineFetchUrl,
  getScenesFetchUrl,
  getStoryFmFetchUrl,
} from '@/config';
import {formatJsonCompact} from '@/utils/json-format';
import {type GamePatchResource, type JsonPatchOp} from '@/utils/json-patch';

export type {GamePatchResource} from '@/utils/json-patch';
export {applyResourcePatch} from '@/utils/json-patch';

function resourceUrl(gameId: string, resource: GamePatchResource): string {
  switch (resource) {
    case 'story-fm':
      return getStoryFmFetchUrl(gameId);
    case 'story-outline':
      return getOutlineFetchUrl(gameId);
    case 'story-scenes':
      return getScenesFetchUrl(gameId);
    case 'story-foreshadowing':
      return getForeshadowingFetchUrl(gameId);
    case 'story-canon':
      return getCanonFetchUrl(gameId);
  }
}

export async function patchGameResource(
  gameId: string,
  resource: GamePatchResource,
  body:
    | {patches: JsonPatchOp[]}
    | {scenePatches: Array<{sceneId: string; path: string; value: unknown}>}
): Promise<void> {
  if (!import.meta.env.DEV) throw new Error('局部保存仅支持开发模式');
  const res = await fetch(resourceUrl(gameId, resource), {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: formatJsonCompact(body),
  });
  const data = (await res.json().catch(() => ({}))) as {ok?: boolean; error?: string};
  if (!res.ok || !data.ok) throw new Error(data.error || `PATCH 失败: ${res.status}`);
}

export async function patchStoryFm(gameId: string, patches: JsonPatchOp[]): Promise<void> {
  await patchGameResource(gameId, 'story-fm', {patches});
}

export async function patchStoryOutline(gameId: string, patches: JsonPatchOp[]): Promise<void> {
  await patchGameResource(gameId, 'story-outline', {patches});
}

export async function patchStoryScenes(
  gameId: string,
  scenePatches: Array<{sceneId: string; path: string; value: unknown}>
): Promise<void> {
  await patchGameResource(gameId, 'story-scenes', {scenePatches});
}
