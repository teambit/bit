import type { ComponentID } from '@teambit/component-id';

/**
 * The part of a lane one workspace is responsible for when `bit ci merge` releases it.
 *
 * A lane can carry components of several scopes, while a workspace tracks only some of them (a
 * repository mirroring one scope tracks that scope's components; a multi-scope monorepo tracks many
 * scopes). The workspace merges, restores config for, tags and exports only the components it
 * tracks; the others are merged by the workspace that tracks them.
 *
 * "Tracked" is deliberately not "scope === defaultScope" (sync's `ownLaneComponents`): `bit ci
 * merge` also runs in multi-scope workspaces, where a defaultScope rule would drop the tracked
 * components of every other scope. In a mirror workspace the two rules select the same slice.
 */
export type LaneSlice<T> = {
  /** active (not deleted) lane components this workspace tracks */
  tracked: T[];
  /** active lane components this workspace doesn't track — another workspace releases them */
  untracked: T[];
};

export function workspaceLaneSlice<T extends { id: ComponentID; isDeleted?: boolean }>(
  laneComponents: T[],
  isTracked: (id: ComponentID) => boolean
): LaneSlice<T> {
  const tracked: T[] = [];
  const untracked: T[] = [];
  laneComponents
    .filter((comp) => !comp.isDeleted)
    .forEach((comp) => (isTracked(comp.id) ? tracked : untracked).push(comp));
  return { tracked, untracked };
}

/** How many untracked lane component ids the summary names before it counts the rest. */
const MAX_LISTED_UNTRACKED = 5;

/** One line naming the lane components this workspace leaves to others; `undefined` when there are none. */
export function untrackedLaneComponentsSummary({ untracked }: LaneSlice<{ id: ComponentID }>): string | undefined {
  if (!untracked.length) return undefined;
  const listed = untracked.slice(0, MAX_LISTED_UNTRACKED).map((comp) => comp.id.toStringWithoutVersion());
  const rest = untracked.length - listed.length;
  return (
    `Lane carries ${untracked.length} component(s) this workspace doesn't track; they are merged by their own ` +
    `workspaces: ${listed.join(', ')}${rest > 0 ? ` and ${rest} more` : ''}`
  );
}
