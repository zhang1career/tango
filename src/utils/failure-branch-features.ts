import type {FeaturesConfig} from '../schema/features';

export function getFailureBranchConfig(features?: FeaturesConfig) {
  return features?.failureBranch ?? features?.branchFailureEnding;
}
