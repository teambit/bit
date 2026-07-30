import type { LanesMain } from '@teambit/lanes';

/**
 * "Which lane is this checkout on?" — answered from the workspace's `.bitmap` alone, with no dependency on
 * the local scope being warm.
 *
 * **This distinction is a production bug, not a style preference.** `lanes.getCurrentLane()` looks like the
 * obvious way to ask, and it is wrong here: it reads the pointer from `.bitmap` and then resolves it through
 * `loadLane()`, i.e. through the **local scope's copy of the lane object**. Those are two different
 * questions. On a warm machine the object is always cached and they agree, so the difference is invisible;
 * on a cold one — a fresh clone on an ephemeral CI runner, whose local scope has never imported the lane —
 * `loadLane()` returns undefined and `getCurrentLane()` answers "main" about a `.bitmap` that provably says
 * otherwise. Every caller that phrased that answer as "the branch's `.bitmap` points at main" was then
 * reporting a fact about the *scope cache* as if it were a fact about the branch.
 *
 * `getCurrentLaneId()` is the honest read: `consumer.bitMap.laneId`, the same source every bit operation
 * resolves "current lane" against, and the same file `bitmap-state.ts` parses off `origin/<branch>`. It
 * cannot be wrong about the pointer, because it *is* the pointer.
 *
 * The production workflow runs on a fresh runner every time, so cold is the normal case and warm is the
 * accident. Anything that reads the current lane to make a DECISION must use this — **including reads that
 * follow a switch**: `switchLanes` throws "already checked out" from `throwForSwitchingToCurrentLane` before
 * it fetches anything, and `CiMain.switchToLane` reports that throw as success, so a switch onto the lane
 * the workspace is already on warms nothing at all.
 *
 * **Divergence from `bitmap-state.ts`, and why it is safe.** That module parses the `.bitmap` committed on
 * `origin/<branch>` and additionally withholds the pointer when bit marked the lane `exported: false` (a
 * `bit lane create` that was never pushed cannot be a lane the reconciler mirrors, and treating it as one
 * licensed deleting branches). This module reads the *live workspace's* pointer and does not apply that
 * gate — deliberately: here the question is only "which lane will the next bit operation act on?", and bit
 * acts on an unexported lane exactly as it does on an exported one. The two answers can therefore differ
 * for a never-exported lane, and in that case the branch-side read is the conservative one while this one
 * is the accurate one. No caller mixes them: attribution and retirement decisions use `bitmap-state`,
 * workspace-operation guards use this.
 */
export function currentLaneIdStr(lanes: LanesMain): string | undefined {
  const laneId = lanes.getCurrentLaneId();
  return !laneId || laneId.isDefault() ? undefined : laneId.toString();
}

/**
 * Make sure the lane the workspace points at — and its components — are actually in the local scope, so a
 * bit-level operation that needs the objects can run on a cold runner.
 *
 * `importCurrentLaneIfMissing` is bit's own, and it is the right shape for this: it is keyed on the
 * `.bitmap` lane id (not on what the scope happens to hold), it returns early when the object is already
 * there, and it fetches from the lane's remote. So calling it is idempotent and free on a warm workspace
 * and load-bearing on a cold one.
 *
 * This is belt-and-braces rather than the only line of defence: `checkoutByCLIValues` opens with
 * `importer.importCurrentObjects()`, which reaches the remote through `getCurrentRemoteLane()` — itself
 * driven by the `.bitmap` lane id — so the merge would import what it needs anyway. Doing it explicitly
 * makes the requirement visible at the call site instead of leaving it as a property of a function three
 * layers down, and it means the workspace is genuinely warm for everything that follows.
 */
export async function ensureCurrentLaneObject(lanes: LanesMain): Promise<void> {
  await lanes.workspace?.importCurrentLaneIfMissing();
}
