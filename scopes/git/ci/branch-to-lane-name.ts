import { DEFAULT_LANE } from '@teambit/lane-id';
import { PREVIOUS_DEFAULT_LANE } from '@teambit/legacy.constants';

const RESERVED_LANE_NAMES = [DEFAULT_LANE, PREVIOUS_DEFAULT_LANE];

/**
 * Turns a git branch name into a lane name: slashes and dots become dashes, and the result is lowercased.
 * A branch whose name is reserved for the default lane (`main`, `master`) — e.g. a PR opened from a fork's
 * default branch — gets a `-branch` suffix, otherwise saving the lane fails only after the whole build ran.
 */
export function branchToLaneName(branchName: string): string {
  const sanitizedBranch = branchName.replace(/[/.]/g, '-').toLowerCase();
  return RESERVED_LANE_NAMES.includes(sanitizedBranch) ? `${sanitizedBranch}-branch` : sanitizedBranch;
}
