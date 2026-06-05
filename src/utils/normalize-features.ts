import type {BranchFailureEndingConfig, FeaturesConfig} from '../schema/features';

/** 兼容旧版 branchFailureEnding.images 数组 */
export function normalizeBranchFailureEnding(
  raw: BranchFailureEndingConfig | undefined
): BranchFailureEndingConfig | undefined {
  if (!raw) return undefined;
  const legacy = raw as BranchFailureEndingConfig & {images?: string[]};
  if (!legacy.image && legacy.images?.length) {
    const first = legacy.images.map((u) => u?.trim()).find(Boolean);
    if (first) {
      const {images: _removed, ...rest} = legacy;
      return {...rest, image: first};
    }
  }
  return raw;
}

export function normalizeFeaturesConfig(raw: FeaturesConfig | null | undefined): FeaturesConfig {
  if (!raw || typeof raw !== 'object') return {battle: {}};
  return {
    ...raw,
    branchFailureEnding: normalizeBranchFailureEnding(raw.branchFailureEnding),
  };
}
