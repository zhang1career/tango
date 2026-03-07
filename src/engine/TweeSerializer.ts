/**
 * Story -> Twee 格式序列化
 */

import type { Story, Passage, PassageLink } from '../types';

function formatLink(link: PassageLink): string {
  const display = link.displayText || link.passageName;
  const cond = link.condition ? ` ${link.condition}` : '';
  const escaped = display.replace(/\]\]/g, '\\]\\]');
  return `[[${escaped}|${link.passageName}]]${cond}`;
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
