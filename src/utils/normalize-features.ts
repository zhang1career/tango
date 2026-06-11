import type {FailureBranchConfig, FeaturesConfig} from '../schema/features';

/** 兼容旧版 failureBranch / branchFailureEnding.images 数组 */
export function normalizeFailureBranch(
  raw: FailureBranchConfig | undefined
): FailureBranchConfig | undefined {
  if (!raw) return undefined;
  const legacy = raw as FailureBranchConfig & {images?: string[]};
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
  const failureBranch = normalizeFailureBranch(raw.failureBranch ?? raw.branchFailureEnding);
  return {
    ...raw,
    ...(failureBranch ? {failureBranch} : {}),
  };
}
