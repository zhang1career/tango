/**
 * 生成轨迹 - story-generation-traces.json（DEV only，不进 zip）
 */

export type GenerationTraceKind =
  | 'plan'
  | 'write'
  | 'audit'
  | 'generate_block'
  | 'assemble_scene'
  | 'canon_settle'
  | 'decompose_scene'
  | 'transition_prompt';

export interface GenerationTracePhase {
  name: string;
  model?: string;
  inputPreview?: string;
  outputPreview?: string;
  verdict?: string;
  error?: string;
}

export interface GenerationTraceEntry {
  id: string;
  at: string;
  kind: GenerationTraceKind;
  sceneId: string;
  sceneName?: string;
  chapterId?: string;
  blockIndex?: number;
  model: string;
  phases: GenerationTracePhase[];
}

export interface StoryGenerationTraces {
  entries: GenerationTraceEntry[];
}

export const EMPTY_GENERATION_TRACES: StoryGenerationTraces = {entries: []};

export function normalizeGenerationTraces(raw: unknown): StoryGenerationTraces {
  if (!raw || typeof raw !== 'object') return {...EMPTY_GENERATION_TRACES};
  const o = raw as Record<string, unknown>;
  const entries = Array.isArray(o.entries)
    ? o.entries
        .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
        .map((e) => ({
          id: String(e.id ?? ''),
          at: String(e.at ?? ''),
          kind: (e.kind as GenerationTraceKind) ?? 'generate_block',
          sceneId: String(e.sceneId ?? ''),
          sceneName: typeof e.sceneName === 'string' ? e.sceneName : undefined,
          chapterId: typeof e.chapterId === 'string' ? e.chapterId : undefined,
          blockIndex: typeof e.blockIndex === 'number' ? e.blockIndex : undefined,
          model: String(e.model ?? ''),
          phases: Array.isArray(e.phases)
            ? e.phases
                .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
                .map((p) => ({
                  name: String(p.name ?? ''),
                  model: typeof p.model === 'string' ? p.model : undefined,
                  inputPreview: typeof p.inputPreview === 'string' ? p.inputPreview : undefined,
                  outputPreview: typeof p.outputPreview === 'string' ? p.outputPreview : undefined,
                  verdict: typeof p.verdict === 'string' ? p.verdict : undefined,
                  error: typeof p.error === 'string' ? p.error : undefined,
                }))
            : [],
        }))
        .filter((e) => e.id && e.sceneId)
    : [];
  return {entries};
}
