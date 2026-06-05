import type {StoryFramework} from '@/schema/story-framework';
import type {GameScene, ScenePassageAiBlock} from '@/schema/game-scene';
import type {StoryCanon} from '@/schema/story-canon';
import type {StoryForeshadowing} from '@/schema/story-foreshadowing';
import type {StoryOutline} from '@/schema/story-outline';
import type {GenerationTracePhase} from '@/schema/story-generation-traces';

export interface TextPolicyBundle {
  globalRules: string[];
  addressingRules?: unknown[];
}

export interface StoryGenerationBundle {
  fw: StoryFramework;
  outline: StoryOutline;
  foreshadowing: StoryForeshadowing;
  canon: StoryCanon;
  policy: TextPolicyBundle;
}

export interface SceneChapterContext {
  chapterId: string;
  chapterTitle: string;
  chapterTheme: string;
  chapterIndex: number;
  sceneIndex: number;
}

export interface GenerateBlockInput {
  bundle: StoryGenerationBundle;
  scene: GameScene;
  chapter: SceneChapterContext;
  aiBlock: ScenePassageAiBlock;
  aiBlockIndex: number;
  passageBlockIndex: number;
}

export interface GenerateBlockResult {
  generatedText: string;
  phases: GenerationTracePhase[];
  canon: StoryCanon;
  foreshadowing: StoryForeshadowing;
}

export interface AssembleSceneInput {
  scene: GameScene;
  chapter?: SceneChapterContext;
}

export interface AssembleSceneResult {
  passageText: string;
  phases: GenerationTracePhase[];
}
