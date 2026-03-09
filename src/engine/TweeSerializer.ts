/**
 * Story -> Twee 格式序列化
 * 支持标准 Twee 3 与 Sugarcube 两种输出格式
 */

import type {Passage, PassageLink, PassageStateActions, Story} from '@/types';

function formatLink(link: PassageLink): string {
  const display = link.displayText || link.passageName;
  const cond = link.condition ? ` ${link.condition}` : '';
  const escaped = display.replace(/]]/g, '\\]\\]');
  return `[[${escaped}|${link.passageName}]]${cond}`;
}

/**
 * 将 $entity 表达式转为 SugarCube 可识别的形式
 * $entity 指代链接目标 passage；$entity.is_used = 该 passage 是否已访问
 */
function conditionToSugarcube(condition: string, targetPassageName: string): string {
  const target = targetPassageName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const hasVisited = `hasVisited("${target}")`;
  let out = condition.trim();
  out = out.replace(/\$entity\.is_used/g, hasVisited);
  return out;
}

function formatLinkSugarcube(link: PassageLink): string {
  const display = (link.displayText || link.passageName).replace(/]]/g, '\\]\\]');
  const target = link.passageName.trim().replace(/\s+/g, '_');
  const setter = linkActionsToSetter(link.linkActions);
  const linkPart = setter ? `[[${display}|${target}][${setter}]]` : `[[${display}|${target}]]`;
  if (link.condition) {
    const sugarcubeCond = conditionToSugarcube(link.condition, link.passageName);
    return `<<if ${sugarcubeCond}>>${linkPart}<<endif>>`;
  }
  return linkPart;
}

function linkActionsToSetter(actions?: PassageStateActions | null): string {
  if (!actions) return '';
  const parts: string[] = [];
  if (actions.set) {
    for (const [k, v] of Object.entries(actions.set)) {
      const val = typeof v === 'string' ? `"${v.replace(/"/g, '\\"')}"` : String(v);
      const varName = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? `$${k}` : `$variables["${k.replace(/"/g, '\\"')}"]`;
      parts.push(`${varName} to ${val}`);
    }
  }
  if (actions.give) {
    const items = Array.isArray(actions.give) ? actions.give : [actions.give];
    for (const item of items) {
      parts.push(`$inventory to $inventory.concat(["${item.replace(/"/g, '\\"')}"])`);
    }
  }
  if (actions.take) {
    const items = Array.isArray(actions.take) ? actions.take : [actions.take];
    for (const item of items) {
      parts.push(`$inventory to $inventory.filter(function(x){return x !== "${item.replace(/"/g, '\\"')}";})`);
    }
  }
  if (actions.rep) {
    for (const [entity, delta] of Object.entries(actions.rep)) {
      const ent = entity.replace(/"/g, '\\"');
      parts.push(`$reputation["${ent}"] to ($reputation["${ent}"] || 0) + ${delta}`);
    }
  }
  return parts.join(', ');
}

function metadataToMacros(metadata?: Record<string, unknown> | null): string {
  if (!metadata) return '';
  const actions = metadata as Record<string, unknown>;
  const lines: string[] = [];
  if (actions.set && typeof actions.set === 'object') {
    for (const [k, v] of Object.entries(actions.set as Record<string, unknown>)) {
      const val = typeof v === 'string' ? `"${String(v).replace(/"/g, '\\"')}"` : String(v);
      const varName = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? `$${k}` : `$variables["${k.replace(/"/g, '\\"')}"]`;
      lines.push(`<<set ${varName} to ${val}>>`);
    }
  }
  if (actions.give !== undefined) {
    const give = Array.isArray(actions.give) ? actions.give : [actions.give];
    for (const item of give) {
      lines.push(`<<run $inventory.push("${String(item).replace(/"/g, '\\"')}")>>`);
    }
  }
  if (actions.take !== undefined) {
    const take = Array.isArray(actions.take) ? actions.take : [actions.take];
    for (const item of take) {
      lines.push(`<<run $inventory = $inventory.filter(function(x){return x !== "${String(item).replace(/"/g, '\\"')}";})>>`);
    }
  }
  if (actions.rep && typeof actions.rep === 'object') {
    for (const [entity, delta] of Object.entries(actions.rep as Record<string, number>)) {
      const ent = entity.replace(/"/g, '\\"');
      lines.push(`<<set $reputation["${ent}"] to ($reputation["${ent}"] || 0) + ${delta}>>`);
    }
  }
  if (lines.length === 0) return '';
  return `<<silently>>\n${lines.join('\n')}\n<</silently>>\n\n`;
}

function formatMetadata(m: Record<string, unknown>): string {
  return ` ${JSON.stringify(m)}`;
}

function serializePassage(p: Passage): string {
  const meta = p.metadata && Object.keys(p.metadata).length > 0 ? formatMetadata(p.metadata) : '';
  const linkLines = p.links.map(formatLink).join('\n');
  const body = [p.text.trim(), linkLines].filter(Boolean).join('\n\n');
  return `:: ${p.name}${meta}\n${body}`;
}

function serializePassageSugarcube(p: Passage): string {
  const meta = p.metadata && Object.keys(p.metadata).length > 0 ? formatMetadata(p.metadata) : '';
  const macros = metadataToMacros(p.metadata);
  const linkLines = p.links.map(formatLinkSugarcube).join('\n');
  const body = [macros, p.text.trim(), linkLines].filter(Boolean).join('\n\n');
  return `:: ${p.name}${meta}\n${body}`;
}

export function serializeStory(story: Story): string {
  const lines: string[] = [];

  lines.push(':: StoryTitle');
  lines.push(story.title);
  lines.push('');

  const storyData: Record<string, unknown> = {
    ...(story.metadata ?? {}),
    start: story.startPassageId,
  };
  lines.push(':: StoryData');
  lines.push(JSON.stringify(storyData));
  lines.push('');

  for (const [, p] of story.passages) {
    if (p.name === 'StoryTitle' || p.name === 'StoryData') continue;
    lines.push(serializePassage(p));
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

/** Sugarcube 格式：生成符合 Sugarcube 语法的 .tw，便于导入 Twine 使用 Sugarcube 发布 */
export function serializeStorySugarcube(story: Story): string {
  const lines: string[] = [];

  lines.push(':: StoryTitle');
  lines.push(story.title);
  lines.push('');

  const storyData: Record<string, unknown> = {
    ...(story.metadata ?? {}),
    format: 'SugarCube',
    'format-version': '2.36.1',
    ifid: (story.metadata as { ifid?: string })?.ifid ?? 'TA-' + Math.random().toString(36).slice(2, 15).toUpperCase(),
    start: story.startPassageId,
  };
  if (!storyData.variables) storyData.variables = {};
  if (!storyData.inventory) storyData.inventory = [];
  if (!storyData.reputation) storyData.reputation = {};
  lines.push(':: StoryData');
  lines.push(JSON.stringify(storyData));
  lines.push('');

  for (const [, p] of story.passages) {
    if (p.name === 'StoryTitle' || p.name === 'StoryData') continue;
    lines.push(serializePassageSugarcube(p));
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
