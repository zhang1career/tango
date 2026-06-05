import type {GameScene} from '../schema/game-scene';
import type {FeaturesConfig} from '../schema/features';

/** 显式空值：undefined、null、纯空白 */
export function isEmptyMediaValue(value: string | undefined | null): boolean {
  return value == null || value.trim() === '';
}

export function isEmptySceneImageList(images: string[] | undefined): boolean {
  if (!images?.length) return true;
  return images.every((u) => isEmptyMediaValue(u));
}

export const EMPTY_SCENE_BACKGROUND_MUSIC = '';
export const EMPTY_SCENE_IMAGES: string[] = [''];

export function sceneMediaDefaultsOnBranchFailureToggle(): Pick<GameScene, 'backgroundMusic' | 'images'> {
  return {backgroundMusic: EMPTY_SCENE_BACKGROUND_MUSIC, images: [...EMPTY_SCENE_IMAGES]};
}

export function resolveSceneBackgroundMusic(
  scene: GameScene,
  features?: FeaturesConfig
): string | undefined {
  if (!isEmptyMediaValue(scene.backgroundMusic)) {
    return scene.backgroundMusic!.trim();
  }
  if (scene.branchFailureEnding) {
    const preset = features?.branchFailureEnding?.backgroundMusic;
    if (!isEmptyMediaValue(preset)) return preset!.trim();
  }
  return undefined;
}

export function resolveSceneImage(scene: GameScene, features?: FeaturesConfig): string | undefined {
  const own = scene.images?.map((u) => u?.trim()).find((u) => u && !isEmptyMediaValue(u));
  if (own) return own;
  if (scene.branchFailureEnding) {
    const preset = features?.branchFailureEnding?.image;
    if (!isEmptyMediaValue(preset)) return preset!.trim();
  }
  return undefined;
}

export function resolvedSceneImagesArray(
  scene: GameScene,
  features?: FeaturesConfig
): string[] | undefined {
  const img = resolveSceneImage(scene, features);
  return img ? [img] : undefined;
}
