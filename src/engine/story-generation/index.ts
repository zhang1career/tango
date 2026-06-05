export {generatePassageBlock, loadGenerationBundle} from './pipeline';
export {assembleScenePassage} from './assemble';
export {buildChapterContext, findChapterForScene, loadTextPolicy} from './context';
export {requireAigcConfig} from './llm';
export type {GenerateBlockInput, GenerateBlockResult, StoryGenerationBundle} from './types';
