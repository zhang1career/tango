import type {GameScene} from '../schema/game-scene';
import type {ChapterNarrativeEdge, StoryFramework} from '../schema/story-framework';

type LegacyNarrativeEdge = ChapterNarrativeEdge & {
  branchFailureEnding?: boolean;
  branchFailureEndingText?: string;
  failureEnding?: string;
};

export function edgeIsBranch(edge: ChapterNarrativeEdge): boolean {
  const legacy = edge as LegacyNarrativeEdge;
  if (legacy.isBranch) return true;
  return !!legacy.branchFailureEnding;
}

export function sceneIsFailure(scene: GameScene): boolean {
  return !!scene.isFailure;
}

export function sceneFailureEndingText(scene: GameScene): string {
  return scene.branchEndingText?.trim() || scene.failureEnding?.trim() || '';
}

export function migrateNarrativeEdgeBranchFields(
  edge: LegacyNarrativeEdge,
  sceneMap: Map<string, GameScene>
): ChapterNarrativeEdge {
  const {
    branchFailureEnding,
    branchFailureEndingText,
    failureEnding,
    sourceHandle,
    targetHandle,
    handlesPinned,
    ...rest
  } = edge;
  const isBranch = !!(rest.isBranch ?? branchFailureEnding);
  const migrated: ChapterNarrativeEdge = {
    ...rest,
    ...(isBranch ? {isBranch: true} : {}),
    ...(handlesPinned && sourceHandle && targetHandle
      ? {handlesPinned: true, sourceHandle, targetHandle}
      : {}),
  };

  const target = sceneMap.get(edge.toSceneId);
  if (target) {
    let changed = false;
    const next: GameScene = {...target};
    if (failureEnding?.trim() && !next.failureEnding?.trim()) {
      next.failureEnding = failureEnding.trim();
      changed = true;
    }
    if (branchFailureEndingText?.trim() && !next.branchEndingText?.trim()) {
      next.branchEndingText = branchFailureEndingText.trim();
      changed = true;
    }
    if ((failureEnding?.trim() || branchFailureEndingText?.trim()) && !next.isFailure) {
      next.isFailure = true;
      changed = true;
    }
    if (changed) sceneMap.set(edge.toSceneId, next);
  }

  return migrated;
}

export function migrateFrameworkBranchModel(fw: StoryFramework): void {
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, {...s}]));
  for (const ch of fw.chapters ?? []) {
    ch.narrativeEdges = (ch.narrativeEdges ?? []).map((e) =>
      migrateNarrativeEdgeBranchFields(e as LegacyNarrativeEdge, sceneMap)
    );
  }
  fw.scenes = [...sceneMap.values()];
}
