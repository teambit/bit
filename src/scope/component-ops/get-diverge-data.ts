import R from 'ramda';
import { ParentNotFound, VersionNotFoundOnFS } from '../exceptions';
import { NoCommonSnap } from '../exceptions/no-common-snap';
import { ModelComponent, Version } from '../models';
import { VersionParents } from '../models/version-history';
import { Ref, Repository } from '../objects';
import { SnapsDistance } from './snaps-distance';
import { getAllVersionHashes, getAllVersionParents } from './traverse-versions';

/**
 * traversing the snaps history is not cheap, so we first try to avoid it and if not possible,
 * traverse by the local head, if it finds the remote head, no need to traverse by the remote
 * head. (it also means that we can do fast-forward and no need for snap-merge).
 *
 * one exception is when at some point, there are two parents. because then, if traversing from one parent doesn't find
 * the remote head, all the snaps from this parent will be considered local incorrectly. we need to traverse also the
 * remote to be able to do the diff between the local snaps and the remote snaps.
 */
export async function getDivergeData({
  repo,
  modelComponent,
  sourceHead, // if empty, use the local head (if on lane - lane head. if on main - component head)
  targetHead,
  throws = true, // otherwise, save the error instance in the `SnapsDistance` object,
  versionObjects, // relevant for remote-scope where during export the data is not in the repo yet.
}: {
  repo: Repository;
  modelComponent: ModelComponent;
  sourceHead?: Ref | null;
  targetHead: Ref | null;
  throws?: boolean;
  versionObjects?: Version[];
}): Promise<SnapsDistance> {
  const isOnLane = modelComponent.laneHeadLocal || modelComponent.laneHeadLocal === null;
  const localHead = sourceHead || (isOnLane ? modelComponent.laneHeadLocal : modelComponent.getHead());
  if (!targetHead) {
    if (localHead) {
      const allLocalHashes = await getAllVersionHashes({
        modelComponent,
        repo,
        throws: false,
        versionObjects,
      });
      return new SnapsDistance(allLocalHashes);
    }
    return new SnapsDistance();
  }
  if (!localHead) {
    const allRemoteHashes = await getAllVersionHashes({
      modelComponent,
      repo,
      throws: false,
      startFrom: targetHead,
      versionObjects,
    });
    return new SnapsDistance([], allRemoteHashes);
  }
  if (targetHead.isEqual(localHead)) {
    // no diverge they're the same
    return new SnapsDistance();
  }

  const versionParents = await getAllVersionParents({
    repo,
    modelComponent,
    heads: [localHead, targetHead],
    throws: false,
    versionObjects,
  });
  const getVersionData = (ref: Ref): VersionParents | undefined => versionParents.find((v) => v.hash.isEqual(ref));

  const snapsOnSource: Ref[] = [];
  const snapsOnTarget: Ref[] = [];
  let targetHeadExistsInSource = false;
  let sourceHeadExistsInTarget = false;
  let commonSnapBeforeDiverge: Ref | undefined;
  let hasMultipleParents = false;
  let error: Error | undefined;

  const commonSnapsWithDepths = {};

  const addParentsRecursively = (version: VersionData, snaps: Ref[], isSource: boolean, depth = 0) => {
    if (snaps.find((snap) => snap.isEqual(version.hash))) return; // already processed

    if (isSource) {
      if (targetHead.isEqual(version.hash)) {
        targetHeadExistsInSource = true;
        return;
      }
      if (version.unrelated?.isEqual(targetHead)) {
        targetHeadExistsInSource = true;
        snaps.push(version.hash);
        return;
      }
    } else {
      if (version.hash.isEqual(localHead)) {
        sourceHeadExistsInTarget = true;
        return;
      }
      if (version.unrelated?.isEqual(localHead)) {
        sourceHeadExistsInTarget = true;
        snaps.push(version.hash);
        return;
      }
      const snapExistsInSource = snapsOnSource.find((snap) => snap.isEqual(version.hash));
      if (snapExistsInSource) {
        if (!commonSnapBeforeDiverge) commonSnapBeforeDiverge = snapExistsInSource;
        else {
          const depthOfCommonSnap = commonSnapsWithDepths[commonSnapBeforeDiverge.toString()];
          if (depthOfCommonSnap > depth) commonSnapBeforeDiverge = snapExistsInSource;
        }
        commonSnapsWithDepths[version.hash.toString()] = depth;
      }
    }

    snaps.push(version.hash);

    if (version.parents.length > 1) hasMultipleParents = true;
    version.parents.forEach((parent) => {
      const parentVersion = getVersionData(parent);
      if (parentVersion) {
        addParentsRecursively(parentVersion, snaps, isSource, depth + 1);
      } else {
        const err = new ParentNotFound(modelComponent.id(), version.hash.toString(), parent.toString());
        if (throws) throw err;
        error = err;
      }
    });
  };
  const localVersion = getVersionData(localHead);
  if (!localVersion) {
    const err =
      new Error(`fatal: a component "${modelComponent.id()}" is missing the local head object (${localHead}) in the filesystem.
run the following command to fix it:
bit import ${modelComponent.id()} --objects`);
    if (throws) throw err;
    return new SnapsDistance(snapsOnSource, [], targetHead, err);
  }
  addParentsRecursively(localVersion, snapsOnSource, true);
  if (targetHeadExistsInSource && !hasMultipleParents) {
    return new SnapsDistance(snapsOnSource, [], targetHead, error);
  }
  const targetVersion = getVersionData(targetHead);
  if (!targetVersion) {
    const err = new VersionNotFoundOnFS(targetHead.toString(), modelComponent.id());
    if (throws) throw err;
    return new SnapsDistance([], [], undefined, err);
  }
  addParentsRecursively(targetVersion, snapsOnTarget, false);

  const sourceOnlySnaps = R.difference(snapsOnSource, snapsOnTarget);
  const targetOnlySnaps = R.difference(snapsOnTarget, snapsOnSource);

  if (sourceHeadExistsInTarget) {
    return new SnapsDistance([], targetOnlySnaps, localHead, error);
  }

  if (targetHeadExistsInSource) {
    // happens when `hasMultipleParents` is true. now that remote was traversed as well, it's possible to find the diff
    return new SnapsDistance(sourceOnlySnaps, [], targetHead, error);
  }

  if (!commonSnapBeforeDiverge) {
    const unmergedData = repo.unmergedComponents.getEntry(modelComponent.name);
    const isUnrelatedFromUnmerged = unmergedData?.unrelated && unmergedData.head.isEqual(localHead);
    const isUnrelatedFromVersionObj = localVersion.unrelated?.isEqual(targetHead);
    if (isUnrelatedFromUnmerged || isUnrelatedFromVersionObj) {
      return new SnapsDistance(snapsOnSource, snapsOnTarget, undefined);
    }
    const err = new NoCommonSnap(modelComponent.id());
    if (throws) throw err;
    return new SnapsDistance(snapsOnSource, snapsOnTarget, undefined, err);
  }

  return new SnapsDistance(sourceOnlySnaps, targetOnlySnaps, commonSnapBeforeDiverge, error);
}

type VersionDataRaw = {
  parents: string[];
  unrelated?: string;
};

type VersionData = {
  hash: Ref;
  parents: Ref[];
  unrelated?: Ref;
};

export type VersionsHistory = { [hash: string]: VersionDataRaw };
