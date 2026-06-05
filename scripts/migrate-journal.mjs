/**
 * 从 story-rules.json + story-metadata.json 生成 story-journal.json，
 * 并将旧 setOn / rule_0002_xxxx 统一回单条 rule_0002(entries[])。
 *
 * 用法: node scripts/migrate-journal.mjs [gameId]
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const gameId = process.argv[2] || 'game_export';
const gameDir = resolve(root, 'assets/games', gameId);

function readJson(name) {
  const p = resolve(gameDir, name);
  if (!existsSync(p)) return undefined;
  return JSON.parse(readFileSync(p, 'utf-8'));
}

function writeJson(name, data) {
  writeFileSync(resolve(gameDir, name), JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

const metadata = readJson('story-metadata.json') ?? {};
const rules = readJson('story-rules.json') ?? [];
const existingCatalog = readJson('story-journal.json') ?? {themes: [], entries: []};
const storyTwRaw = existsSync(resolve(gameDir, 'story.tw'))
  ? readFileSync(resolve(gameDir, 'story.tw'), 'utf-8')
  : '';
const themes = (metadata.journalThemes ?? []).map((t) => ({
  id: t.id,
  name: t.name,
  order: t.order ?? 0,
  description: t.description,
}));

const entryMap = new Map();
let order = 0;

function collectJournalAppend(ja) {
  if (!ja) return;
  const list = Array.isArray(ja) ? ja : [ja];
  for (const j of list) {
    if (!j?.id) continue;
    if (entryMap.has(j.id)) continue;
    entryMap.set(j.id, {
      id: j.id,
      themeId: j.theme || 'theme_legacy',
      title: j.title || j.id,
      content: j.content || '',
      tags: j.tags,
      order: order++,
    });
  }
}

const rule2 = rules.find((r) => r.id === 'rule_0002');
const splitRules = rules.filter((r) => /^rule_0002_\d+$/.test(String(r.id)));
const setOnList = rule2?.setOn ? (Array.isArray(rule2.setOn) ? rule2.setOn : [rule2.setOn]) : [];
for (const item of setOnList) collectJournalAppend(item.journalAppend);

if (entryMap.size === 0 && storyTwRaw) {
  const m = storyTwRaw.match(/:: StoryData\n([\s\S]*?)\n\n:: /);
  if (m) {
    const storyData = JSON.parse(m[1]);
    const legacy = (storyData.gameRules ?? []).find((r) => r.id === 'rule_0002');
    const legacySetOn = legacy?.setOn
      ? (Array.isArray(legacy.setOn) ? legacy.setOn : [legacy.setOn])
      : [];
    for (const item of legacySetOn) collectJournalAppend(item.journalAppend);
  }
}

const catalog = {
  themes: themes.length ? themes : (existingCatalog.themes ?? []),
  entries: entryMap.size ? [...entryMap.values()] : (existingCatalog.entries ?? []),
};

if (!catalog.themes.length && catalog.entries.length) {
  const themeIds = [...new Set(catalog.entries.map((e) => e.themeId || 'theme_legacy'))].sort();
  catalog.themes = themeIds.map((id, i) => ({
    id,
    name: String(id).replace(/^theme_/, '').replace(/_/g, ' '),
    order: i + 1,
  }));
}

writeJson('story-journal.json', catalog);

function toEffects(setOn) {
  const effects = [];
  if (setOn.set) {
    for (const [key, value] of Object.entries(setOn.set)) {
      effects.push({type: 'set', key, value});
    }
  }
  const ja = setOn.journalAppend;
  if (ja) {
    const list = Array.isArray(ja) ? ja : [ja];
    for (const j of list) {
      if (j?.id) effects.push({type: 'journal.unlock', journalId: j.id});
    }
  }
  if (setOn.effects) {
    const ex = Array.isArray(setOn.effects) ? setOn.effects : [setOn.effects];
    effects.push(...ex);
  }
  return effects;
}

const migratedEntries = [];
for (const item of setOnList) {
  migratedEntries.push({
    when: item.when,
    judgeExpr: item.judgeExpr || rule2?.judgeExpr || undefined,
    effects: toEffects(item),
  });
}
for (const r of splitRules) {
  migratedEntries.push({
    when: r.when,
    judgeExpr: r.judgeExpr || undefined,
    effects: Array.isArray(r.effects) ? r.effects : (r.effects ? [r.effects] : []),
  });
}
if (migratedEntries.length > 0) {
  const keep = rules.filter((r) => r.id !== 'rule_0002' && !/^rule_0002_\d+$/.test(String(r.id)));
  const merged = {
    id: 'rule_0002',
    name: rule2?.name || 'setOn',
    judgeExpr: rule2?.judgeExpr || undefined,
    entries: migratedEntries,
  };
  keep.push(merged);
  writeJson('story-rules.json', keep);
}

const onlyOnce = rules.find((r) => r.id === 'rule_0001');
if (onlyOnce && (onlyOnce.writebackExpr || !onlyOnce.effects)) {
  const updated = (readJson('story-rules.json') ?? rules).map((r) => {
    if (r.id !== 'rule_0001') return r;
    return {
      id: 'rule_0001',
      name: r.name || 'onlyOnce',
      judgeExpr: r.judgeExpr || '!$entity.is_used',
      effects: [{type: 'entity.mark_used'}],
    };
  });
  writeJson('story-rules.json', updated);
}

const metaOut = {...metadata};
delete metaOut.journalThemes;
writeJson('story-metadata.json', metaOut);

console.log(`[${gameId}] themes=${catalog.themes.length} entries=${catalog.entries.length}`);
