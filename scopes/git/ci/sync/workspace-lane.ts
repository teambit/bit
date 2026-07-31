import type { LanesMain } from '@teambit/lanes';

/**
 * Current lane of this checkout, read from the workspace's `.bitmap` pointer only. Must NOT go through
 * `lanes.getCurrentLane()`: that resolves via the local scope's lane object, which is absent on a cold
 * runner and falsely answers "main". Unlike `parseBranchBitmap`, no `exported` gate applies here — this
 * answers "which lane will the next bit operation act on?", not attribution/retirement.
 */
export function currentLaneIdStr(lanes: LanesMain): string | undefined {
  const laneId = lanes.getCurrentLaneId();
  return !laneId || laneId.isDefault() ? undefined : laneId.toString();
}

/**
 * Ensure the lane the workspace points at is present in the local scope (idempotent; needed on a cold
 * runner before bit-level operations that touch lane objects).
 */
export async function ensureCurrentLaneObject(lanes: LanesMain): Promise<void> {
  await lanes.workspace?.importCurrentLaneIfMissing();
}
