/**
 * Twee 3 格式解析器 - 兼容 Twine
 * 参考: https://github.com/iftechfoundation/twine-specs/blob/master/twee-3-specification.md
 * 扩展: 条件链接、StoryData、passage metadata、Sugarcube 语法（<<if>>、<<set>>、[[link][setter]]）
 * 多媒体: <<image>>、<<audio>>、<<video>> 宏展开，及 HTML <img>/<audio>/<video> 的 src 解析
 */

import {resolveMediaUrl} from '@/config';
import type {Passage, PassageLink, PassageStateActions, Story} from '@/types';

const PASSAGE_HEADER_RE = /^::\s*(.+?)(?:\s+\[([^\]]*)])?(?:\s*(\{.*}))?$/;

/** 解析 Sugarcube setter 如 [$x to 1, $rep.xxx to 5, $reputation["x"] to ($reputation["x"]||0)+5] 为 linkActions */
function parseSetterToActions(setterStr: string): PassageStateActions | undefined {
  const actions: PassageStateActions = {};
  const assignments = setterStr.split(',').map((s) => s.trim()).filter(Boolean);
  for (const a of assignments) {
    const repBracket = a.match(/^\$reputation\[\s*"([^"]+)"\s*]\s+to\s+\([^)]*\)\s*\+\s*(\d+)\s*$/);
    if (repBracket) {
      actions.rep = actions.rep ?? {};
      actions.rep[repBracket[1]] = (actions.rep[repBracket[1]] ?? 0) + Number(repBracket[2]);
      continue;
    }
    const m = a.match(/^\$([a-zA-Z0-9_.]+)\s+to\s+(.+)$/);
    if (!m) continue;
    const [, path, valStr] = m;
    const val = parseSetterValue(valStr.trim());
    if (val === undefined && !valStr.includes('concat') && !valStr.includes('filter')) continue;
    if (path.startsWith('reputation.') || path.startsWith('rep.')) {
      const entity = path.replace(/^(reputation|rep)\./, '');
      actions.rep = actions.rep ?? {};
      actions.rep[entity] = (actions.rep[entity] ?? 0) + (typeof val === 'number' ? val : Number(val) || 0);
    } else if (path === 'inventory') {
      const concat = valStr.match(/concat\(\s*\[\s*"([^"]*)"\s*]\s*\)/);
      if (concat) {
        actions.give = actions.give ? (Array.isArray(actions.give) ? [...actions.give, concat[1]] : [actions.give, concat[1]]) : concat[1];
      }
      const filter = valStr.match(/filter\([^)]*"([^"]*)"[^)]*\)/);
      if (filter) {
        actions.take = actions.take ? (Array.isArray(actions.take) ? [...actions.take, filter[1]] : [actions.take, filter[1]]) : filter[1];
      }
    } else if (val !== undefined) {
      actions.set = actions.set ?? {};
      (actions.set as Record<string, string | number | boolean>)[path] = val as string | number | boolean;
    }
  }
  return Object.keys(actions).length ? actions : undefined;
}

function parseSetterValue(s: string): string | number | boolean | undefined {
  if (s === 'true') return true;
  if (s === 'false') return false;
  const n = Number(s);
  if (!Number.isNaN(n) && String(n) === s) return n;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  if (s.startsWith('$')) return undefined;
  if (s.includes('||') || s.includes('+')) {
    const numMatch = s.match(/\([^)]*\)\s*\+\s*(\d+)/);
    if (numMatch) return Number(numMatch[1]);
  }
  return s;
}

/** 展开 SugarCube 媒体宏为 HTML，并解析媒体 URL */
function expandMediaMacros(text: string): string {
  let out = text;
  // <<image "path">> 或 <<image "path" "alt">> 或 <<image "path" alt="x" width="400">>
  out = out.replace(/<<image\s+([^>]+)>>/gi, (_, args) => {
    const pathMatch = args.match(/["']([^"']+)["']/);
    const path = pathMatch ? pathMatch[1] : args.trim().split(/\s+/)[0] || '';
    const resolved = resolveMediaUrl(path);
    const altMatch = args.match(/(?:alt|title)\s*=\s*["']([^"']*)["']/i) || args.match(/["']([^"']+)["']\s*["']([^"']*)["']/);
    const alt = altMatch ? (altMatch[2] ?? altMatch[1]) : '';
    const widthMatch = args.match(/(?:width|w)\s*=\s*["']?([^\s"'>]+)["']?/i);
    const heightMatch = args.match(/(?:height|h)\s*=\s*["']?([^\s"'>]+)["']?/i);
    const attrs = [`src="${resolved}"`];
    if (alt) attrs.push(`alt="${alt.replace(/"/g, '&quot;')}"`);
    if (widthMatch) attrs.push(`width="${widthMatch[1]}"`);
    if (heightMatch) attrs.push(`height="${heightMatch[1]}"`);
    return `<img ${attrs.join(' ')}>`;
  });
  // <<audio "path" play [loop] [muted]>>
  out = out.replace(/<<audio\s+([^>]+)>>/gi, (_, args) => {
    const pathMatch = args.match(/["']([^"']+)["']/);
    const path = pathMatch ? pathMatch[1] : '';
    const resolved = resolveMediaUrl(path);
    const rest = args.slice(pathMatch ? pathMatch[0].length : 0).toLowerCase();
    const attrs = ['src="' + resolved + '"'];
    if (/\bplay\b/.test(rest)) attrs.push('autoplay');
    if (/\bloop\b/.test(rest)) attrs.push('loop');
    if (/\bmuted\b/.test(rest)) attrs.push('muted');
    if (/\bcontrols\b/.test(rest)) attrs.push('controls');
    return `<audio ${attrs.join(' ')}>`;
  });
  // <<carousel "url1" "url2" ...>> - TA 轮播，多图切换
  out = out.replace(/<<carousel\s+([^>]+)>>/gi, (_, args) => {
    const urls: string[] = [];
    const re = /["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(args)) !== null) urls.push(resolveMediaUrl(m[1]));
    if (urls.length === 0) return '';
    const json = JSON.stringify(urls);
    return `<div class="media-carousel" data-images="${json.replace(/"/g, '&quot;')}"><img src="${urls[0]}" alt=""></div>`;
  });

  // <<video "path" [autoplay] [loop] [muted] [controls]>>
  out = out.replace(/<<video\s+([^>]+)>>/gi, (_, args) => {
    const pathMatch = args.match(/["']([^"']+)["']/);
    const path = pathMatch ? pathMatch[1] : '';
    const resolved = resolveMediaUrl(path);
    const rest = args.slice(pathMatch ? pathMatch[0].length : 0).toLowerCase();
    const attrs = ['src="' + resolved + '"'];
    if (/\bautoplay\b/.test(rest)) attrs.push('autoplay');
    if (/\bloop\b/.test(rest)) attrs.push('loop');
    if (/\bmuted\b/.test(rest)) attrs.push('muted');
    if (/\bcontrols\b/.test(rest)) attrs.push('controls');
    return `<video ${attrs.join(' ')}>`;
  });
  return out;
}

/** 将 HTML 中 img/audio/video 的 src 相对路径解析为带 base 的 URL */
function resolveMediaSrcInHtml(text: string): string {
  return text.replace(
    /<(img|audio|video)([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi,
    (_, tag, before, src, after) => {
      const resolved = resolveMediaUrl(src);
      return `<${tag}${before} src="${resolved}"${after}>`;
    }
  );
}

/** Sugarcube 段落内容解析：提取链接（含 setter、<<if>>）、<<set>>/<<run>> 等宏 */
function parseSugarcubeContent(rawContent: string): {
  text: string;
  links: Array<{ displayText: string; passageName: string; condition?: string; linkActions?: PassageStateActions }>;
  metadataMerge: Partial<PassageStateActions>;
} {
  let text = expandMediaMacros(rawContent);
  const links: Array<{
    displayText: string;
    passageName: string;
    condition?: string;
    linkActions?: PassageStateActions
  }> = [];
  const metadataMerge: Partial<PassageStateActions> = {};
  const setVars: Record<string, string | number | boolean> = {};
  const giveItems: string[] = [];
  const takeItems: string[] = [];
  const repDeltas: Record<string, number> = {};

  const collectSet = (key: string, val: string | number | boolean) => {
    setVars[key] = val;
  };
  const collectGive = (item: string) => {
    giveItems.push(item);
  };
  const collectTake = (item: string) => {
    takeItems.push(item);
  };
  const collectRep = (entity: string, delta: number) => {
    repDeltas[entity] = (repDeltas[entity] ?? 0) + delta;
  };

  const extractMacros = (block: string) => {
    block.replace(/<<set\s+\$variables\[\s*"([^"]+)"\s*]\s+to\s+([^>]+)>>/g, (_, key, valStr) => {
      const v = parseSetterValue(valStr.trim());
      if (v !== undefined) collectSet(key.replace(/\\"/g, '"'), v as string | number | boolean);
      return '';
    });
    block.replace(/<<set\s+\$([a-zA-Z0-9_.]+)\s+to\s+([^>]+)>>/g, (_, key, valStr) => {
      const v = parseSetterValue(valStr.trim());
      if (v !== undefined) collectSet(key, v as string | number | boolean);
      return '';
    });
    block.replace(/<<set\s+\$reputation\["([^"]+)"]\s+to\s+(.+?)>>/g, (_, entity, expr) => {
      const m = expr.match(/\(\s*\$reputation\["[^"]+"]\s*\|\|\s*0\s*\)\s*\+\s*(\d+)/);
      collectRep(entity, m ? Number(m[1]) : 0);
      return '';
    });
    block.replace(/<<run\s+\$inventory\.push\("([^"]*)"\)>>/g, (_, item) => {
      collectGive(item);
      return '';
    });
    block.replace(/<<run\s+\$inventory\s*=\s*\$inventory\.filter\([^)]+\)>>/g, (m) => {
      const itemMatch = m.match(/x\s*!==\s*"([^"]*)"/);
      if (itemMatch) collectTake(itemMatch[1]);
      return '';
    });
  };

  text = text.replace(/<<silently>>[\s\S]*?<<\/silently>>/gi, (m) => {
    extractMacros(m);
    return '';
  });
  extractMacros(text);
  text = text.replace(/<<set\s+\$[^>]+>>/g, '');
  text = text.replace(/<<run\s+[^>]+>>/g, '');

  const pushLink = (
    display: string,
    target: string,
    cond?: string,
    linkActions?: PassageStateActions
  ) => {
    links.push({
      displayText: display.trim(),
      passageName: target.trim().replace(/\s+/g, '_'),
      condition: cond && cond.trim() ? cond.trim() : undefined,
      linkActions,
    });
  };

  text = text.replace(/<<if\s+([^>]+)>>([\s\S]*?)<<endif>>/gi, (_, cond, inner) => {
    const setterLinkRe = /\[\[([^\]|]+)\|([^\]]+)]]\s*\[\s*([^\]]+)\s*]/g;
    const plainLinkRe = /\[\[([^\]|]+)\|([^\]]+)]]|\[\[([^\]|]+)->([^\]]+)]]|\[\[([^\]|]+)<-([^\]]+)]]/g;
    let found = false;
    inner.replace(setterLinkRe, (m: string, d: string, t: string, setter: string) => {
      found = true;
      pushLink(d, t, cond, parseSetterToActions(setter));
      return '';
    });
    if (!found) {
      inner.replace(plainLinkRe, (m: string, d?: string, t?: string, d2?: string, t2?: string, d3?: string, t3?: string) => {
        const disp = d ?? d2 ?? t3 ?? '';
        const tgt = t ?? t2 ?? d3 ?? '';
        if (disp || tgt) {
          found = true;
          pushLink(disp || tgt, tgt || disp, cond, undefined);
        }
        return '';
      });
    }
    return '';
  });

  const setterLinkRe = /\[\[([^\]|]+)\|([^\]]+)]]\s*\[\s*([^\]]+)\s*]/g;
  text = text.replace(setterLinkRe, (_, display: string, target: string, setter: string) => {
    pushLink(display, target, undefined, parseSetterToActions(setter));
    return '';
  });

  const standardLinks = parseLinks(text);
  for (const l of standardLinks) {
    pushLink(l.displayText, l.passageName, l.condition, undefined);
  }

  text = text.replace(
    /\[\[([^\]]+?)(?:\|([^\]]+?))?]]|\[\[([^\]]+?)->([^\]]+?)]]|\[\[([^\]]+?)<-([^\]]+?)]](\s+[^\[]*)?(?=\[\[|$)/g,
    ''
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (Object.keys(setVars).length) metadataMerge.set = setVars;
  if (giveItems.length) metadataMerge.give = giveItems.length === 1 ? giveItems[0] : giveItems;
  if (takeItems.length) metadataMerge.take = takeItems.length === 1 ? takeItems[0] : takeItems;
  if (Object.keys(repDeltas).length) metadataMerge.rep = repDeltas;

  text = resolveMediaSrcInHtml(text);
  return {text, links, metadataMerge};
}

function parseLinks(text: string): Array<{
  displayText: string;
  passageName: string;
  raw: string;
  condition?: string
}> {
  const links: Array<{ displayText: string; passageName: string; raw: string; condition?: string }> = [];
  // 匹配 [[...]] 及可选条件（]] 后至下一个 [[ 或结尾）
  const fullRe = /\[\[([^\]]+?)(?:\|([^\]]+?))?]]|\[\[([^\]]+?)->([^\]]+?)]]|\[\[([^\]]+?)<-([^\]]+?)]](\s+[^\[]*)?(?=\[\[|$)/g;
  let m: RegExpExecArray | null;

  while ((m = fullRe.exec(text)) !== null) {
    const raw = m[0];
    let displayText: string;
    let passageName: string;
    const conditionPart = m[8]?.trim();

    if (m[3] && m[4]) {
      displayText = m[3].trim();
      passageName = m[4].trim();
    } else if (m[5] && m[6]) {
      displayText = m[6].trim();
      passageName = m[5].trim();
    } else if (m[1] && m[2]) {
      displayText = m[1].trim();
      passageName = m[2].trim();
    } else if (m[1]) {
      passageName = m[1].trim();
      displayText = passageName;
    } else {
      continue;
    }
    links.push({
      displayText,
      passageName,
      raw: raw.replace(/\s+[^\[]*$/, ''), // raw 不含 condition，用于替换
      condition: conditionPart && !conditionPart.startsWith('[[') ? conditionPart : undefined,
    });
  }
  return links;
}

function normalizeId(name: string): string {
  return name.trim().replace(/\s+/g, '_');
}

export function parseTwee(source: string): Story {
  const passages = new Map<string, Passage>();
  let startPassageId = 'Start';
  let title = 'Untitled Story';
  let storyMetadata: Record<string, unknown> = {};

  const lines = source.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const headerMatch = line.match(PASSAGE_HEADER_RE);
    if (!headerMatch) {
      i++;
      continue;
    }

    const [, namePart, tagsStr, metaStr] = headerMatch;
    const name = namePart.trim();
    const tags = tagsStr ? tagsStr.split(/\s+/).filter(Boolean) : [];
    let metadata: Record<string, unknown> = {};
    if (metaStr) {
      try {
        metadata = JSON.parse(metaStr);
      } catch {
        // 忽略解析错误
      }
    }

    const contentLines: string[] = [];
    i++;
    while (i < lines.length && !lines[i].match(PASSAGE_HEADER_RE)) {
      contentLines.push(lines[i]);
      i++;
    }
    const rawContent = contentLines.join('\n').trim();

    if (name === 'StoryTitle') {
      title = rawContent || 'Untitled Story';
      continue;
    }

    if (name === 'StoryData') {
      try {
        storyMetadata = JSON.parse(rawContent);
        const start = (storyMetadata as { start?: string }).start;
        if (start) startPassageId = normalizeId(start);
      } catch {
        // 忽略
      }
      continue;
    }

    const sugarcube = parseSugarcubeContent(rawContent);
    const mergedMeta: Record<string, unknown> = {...metadata};
    if (sugarcube.metadataMerge.set) {
      mergedMeta.set = {...((mergedMeta.set as Record<string, unknown>) ?? {}), ...sugarcube.metadataMerge.set};
    }
    if (sugarcube.metadataMerge.give) {
      const prev = (mergedMeta.give as string[]) ?? [];
      mergedMeta.give = Array.isArray(sugarcube.metadataMerge.give)
        ? [...(Array.isArray(prev) ? prev : [prev]), ...sugarcube.metadataMerge.give]
        : [...(Array.isArray(prev) ? prev : prev ? [prev] : []), sugarcube.metadataMerge.give];
    }
    if (sugarcube.metadataMerge.take) {
      const prev = (mergedMeta.take as string[]) ?? [];
      mergedMeta.take = Array.isArray(sugarcube.metadataMerge.take)
        ? [...(Array.isArray(prev) ? prev : [prev]), ...sugarcube.metadataMerge.take]
        : [...(Array.isArray(prev) ? prev : prev ? [prev] : []), sugarcube.metadataMerge.take];
    }
    if (sugarcube.metadataMerge.rep) {
      mergedMeta.rep = {...((mergedMeta.rep as Record<string, number>) ?? {}), ...sugarcube.metadataMerge.rep};
    }

    const id = normalizeId(name);
    passages.set(id, {
      id,
      name,
      text: sugarcube.text,
      tags: tags.length ? tags : undefined,
      metadata: Object.keys(mergedMeta).length ? mergedMeta : undefined,
      links: sugarcube.links.map(
        (l): PassageLink => ({
          displayText: l.displayText,
          passageName: l.passageName,
          condition: l.condition,
          linkActions: l.linkActions,
        })
      ),
    });
  }

  if (!passages.has(startPassageId)) {
    const first = passages.keys().next().value;
    if (first) startPassageId = first;
  }

  return {
    title,
    startPassageId,
    passages,
    metadata: Object.keys(storyMetadata).length ? storyMetadata : undefined,
  };
}
