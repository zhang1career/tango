import {getScenesFetchUrl} from '@/config';
import {formatJsonCompact} from '../utils/json-format';

export async function saveStoryScenes(
  gameId: string,
  scenes: unknown
): Promise<{ok: boolean; error?: string}> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(getScenesFetchUrl(gameId), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: formatJsonCompact(scenes),
      });
      const json = (await res.json()) as {ok?: boolean; error?: string};
      if (res.ok && json.ok) return {ok: true};
      return {ok: false, error: json.error || `HTTP ${res.status}`};
    } catch (e) {
      return {ok: false, error: String(e)};
    }
  }
  const blob = new Blob([formatJsonCompact(scenes)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'story-scenes.json';
  a.click();
  URL.revokeObjectURL(url);
  return {ok: true};
}
