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
  otherTargetsHeads, // when targetHead empty, instead of returning all local snaps, stop if found one of these snaps
  throws = true, // otherwise, save the error instance in the `SnapsDistance` object,
  versionObjects, // relevant for remote-scope where during export the data is not in the repo yet.
}: {
  repo: Repository;
  modelComponent: ModelComponent;
  sourceHead?: Ref | null;
  targetHead: Ref | null;
  otherTargetsHeads?: Ref[];
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
        stopAt: otherTargetsHeads,
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

  const existOnRemote = (ref: Ref) => [targetHead, ...(otherTargetsHeads || [])].find((r) => r.isEqual(ref));

  const snapsOnLocal: Ref[] = [];
  const snapsOnRemote: Ref[] = [];
  let remoteHeadExistsLocally = false;
  let localHeadExistsRemotely = false;
  let commonSnapBeforeDiverge: Ref | undefined;
  let hasMultipleParents = false;
  let error: Error | undefined;
  const addParentsRecursively = (version: VersionData, snaps: Ref[], isLocal: boolean) => {
    if (snaps.find((snap) => snap.isEqual(version.hash))) return;

    if (isLocal && existOnRemote(version.hash)) {
      remoteHeadExistsLocally = true;
      return;
    }
    if (!isLocal && version.hash.isEqual(localHead)) {
      localHeadExistsRemotely = true;
      return;
    }
    if (isLocal && version.unrelated?.isEqual(targetHead)) {
      remoteHeadExistsLocally = true;
      snaps.push(version.hash);
      return;
    }
    if (!isLocal && version.unrelated?.isEqual(localHead)) {
      localHeadExistsRemotely = true;
      snaps.push(version.hash);
      return;
    }
    if (!isLocal && !commonSnapBeforeDiverge) {
      const snapExistLocally = snapsOnLocal.find((snap) => snap.isEqual(version.hash));
      if (snapExistLocally) commonSnapBeforeDiverge = snapExistLocally;
    }
    snaps.push(version.hash);
    if (version.parents.length > 1) hasMultipleParents = true;
    version.parents.forEach((parent) => {
      const parentVersion = getVersionData(parent);
      if (parentVersion) {
        addParentsRecursively(parentVersion, snaps, isLocal);
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
    return new SnapsDistance(snapsOnLocal, [], targetHead, err);
  }
  addParentsRecursively(localVersion, snapsOnLocal, true);
  if (remoteHeadExistsLocally && !hasMultipleParents) {
    return new SnapsDistance(snapsOnLocal, [], targetHead, error);
  }
  const remoteVersion = getVersionData(targetHead);
  if (!remoteVersion) {
    const err = new VersionNotFoundOnFS(targetHead.toString(), modelComponent.id());
    if (throws) throw err;
    return new SnapsDistance([], [], undefined, err);
  }
  addParentsRecursively(remoteVersion, snapsOnRemote, false);
  if (localHeadExistsRemotely) {
    return new SnapsDistance([], R.difference(snapsOnRemote, snapsOnLocal), localHead, error);
  }

  if (remoteHeadExistsLocally) {
    // happens when `hasMultipleParents` is true. now that remote was traversed as well, it's possible to find the diff
    return new SnapsDistance(R.difference(snapsOnLocal, snapsOnRemote), [], targetHead, error);
  }

  if (!commonSnapBeforeDiverge) {
    const unmergedData = repo.unmergedComponents.getEntry(modelComponent.name);
    const isUnrelatedFromUnmerged = unmergedData?.unrelated && unmergedData.head.isEqual(targetHead);
    const isUnrelatedFromVersionObj = localVersion.unrelated?.isEqual(targetHead);
    if (isUnrelatedFromUnmerged || isUnrelatedFromVersionObj) {
      return new SnapsDistance(snapsOnLocal, snapsOnRemote, undefined);
    }
    const err = new NoCommonSnap(modelComponent.id());
    if (throws) throw err;
    return new SnapsDistance(snapsOnLocal, snapsOnRemote, undefined, err);
  }
  return new SnapsDistance(
    R.difference(snapsOnLocal, snapsOnRemote),
    R.difference(snapsOnRemote, snapsOnLocal),
    commonSnapBeforeDiverge,
    error
  );
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
