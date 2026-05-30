import type {GameScene} from '../schema/game-scene';

function splitChineseSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？；])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function trimLeadingPunctuation(text: string): string {
  return text.replace(/^[，。、；：…\s\n]+/, '').trim();
}

function sentenceOverlapVariants(sentence: string): string[] {
  const trimmed = sentence.trim();
  if (!trimmed) return [];
  const core = trimmed.replace(/[。！？；]$/, '');
  const variants = new Set<string>([trimmed]);
  if (core) {
    variants.add(`"${core}"`);
    variants.add(`“${core}”`);
    variants.add(`「${core}」`);
    variants.add(`『${core}』`);
    variants.add(`"${core}。"`);
    variants.add(`“${core}。”`);
  }
  return Array.from(variants).sort((a, b) => b.length - a.length);
}

function removeSentenceOverlap(result: string, sentence: string): string {
  if (sentence.length < 8) return result;
  let next = result;
  for (const variant of sentenceOverlapVariants(sentence)) {
    if (!next.includes(variant)) continue;
    next = next.split(variant).join('');
  }
  return next.replace(/\s{2,}/g, ' ').trim();
}

export function collectPrecedingRawTexts(scene: GameScene, aiBlockIndex: number): string[] {
  const blocks = scene.passageBlocks ?? [];
  const texts: string[] = [];
  for (let i = 0; i < aiBlockIndex; i++) {
    const block = blocks[i];
    if (block?.type !== 'raw') continue;
    const text = block.text?.trim();
    if (text) texts.push(text);
  }
  return texts;
}

/** Remove prose duplicated from raw blocks that are already rendered before this AI block. */
export function stripAiTextOverlappingRaw(aiText: string, rawTexts: string[]): string {
  let result = aiText.trim();
  if (!result || rawTexts.length === 0) return result;

  for (const raw of rawTexts) {
    const rawTrim = raw.trim();
    if (!rawTrim) continue;

    while (result.startsWith(rawTrim)) {
      result = trimLeadingPunctuation(result.slice(rawTrim.length));
    }

    if (rawTrim.length >= 10) {
      const maxProbe = Math.min(rawTrim.length, result.length);
      for (let len = maxProbe; len >= 10; len--) {
        if (result.startsWith(rawTrim.slice(0, len))) {
          result = trimLeadingPunctuation(result.slice(len));
          break;
        }
      }
    }

    for (const sentence of splitChineseSentences(rawTrim)) {
      result = removeSentenceOverlap(result, sentence);
    }
  }

  return result.replace(/\n{3,}/g, '\n\n').replace(/^[，。、；：…\s\n]+/, '').trim();
}
