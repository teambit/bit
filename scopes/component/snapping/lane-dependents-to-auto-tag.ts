import semver from 'semver';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import { isTag } from '@teambit/component-version';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { AutoTagResult } from '@teambit/workspace';

/**
 * returns the lane entries that need to be snapped along with `idsToTag`. an entry is a dependent when one of its
 * direct dependencies is in `idsToTag`, or is another entry that is a dependent.
 *
 * the dependencies are matched by component-id and not by version, the same as the workspace auto-tag. a lane entry
 * often depends on a version other than the one being snapped from, e.g. a hidden entry that was cascaded against the
 * other side of a merge, or against a version that came from the remote. matching by version skips such an entry and
 * leaves it pointing to a version that is no longer the head of the lane.
 *
 * only the direct dependencies are followed. an entry that reaches `idsToTag` through a component that isn't a
 * candidate gains nothing from a snap, because that component keeps the old version.
 */
export function getLaneDependentsToAutoTag(
  candidates: ConsumerComponent[],
  idsToTag: ComponentIdList
): AutoTagResult[] {
  const triggeredByPerDependent = new Map<string, ComponentIdList>();
  const getTriggeredBy = (candidate: ConsumerComponent): ComponentIdList => {
    const triggeredBy: ComponentID[] = [];
    candidate.getAllDependenciesIds().forEach((depId) => {
      const idToTag = idsToTag.searchWithoutVersion(depId);
      if (idToTag && !isDowngrade(idToTag, depId)) triggeredBy.push(idToTag);
      triggeredBy.push(...(triggeredByPerDependent.get(depId.toStringWithoutVersion()) || []));
    });
    return ComponentIdList.uniqFromArray(triggeredBy);
  };
  // a dependent can make another candidate a dependent, so repeat until nothing changes. the sets only grow, and are
  // limited by the size of idsToTag, so this ends.
  let hasChanged = true;
  while (hasChanged) {
    hasChanged = false;
    candidates.forEach((candidate) => {
      const idStr = candidate.id.toStringWithoutVersion();
      const triggeredBy = getTriggeredBy(candidate);
      if (triggeredBy.length && triggeredBy.length !== triggeredByPerDependent.get(idStr)?.length) {
        triggeredByPerDependent.set(idStr, triggeredBy);
        hasChanged = true;
      }
    });
  }
  return candidates
    .filter((candidate) => triggeredByPerDependent.has(candidate.id.toStringWithoutVersion()))
    .map((candidate) => ({
      component: candidate,
      triggeredBy: triggeredByPerDependent.get(candidate.id.toStringWithoutVersion()) as ComponentIdList,
    }));
}

/**
 * same as the workspace auto-tag: when the dependent already depends on a higher tag, don't downgrade it.
 */
function isDowngrade(idToTag: ComponentID, depId: ComponentID): boolean {
  if (!isTag(idToTag.version) || !isTag(depId.version)) return false;
  return !semver.gte(idToTag.version as string, depId.version as string);
}
