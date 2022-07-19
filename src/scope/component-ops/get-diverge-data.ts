import R from 'ramda';

import { ParentNotFound, VersionNotFoundOnFS } from '../exceptions';
import { NoCommonSnap } from '../exceptions/no-common-snap';
import { ModelComponent, Version } from '../models';
import { Ref, Repository } from '../objects';
import { DivergeData } from './diverge-data';
import { getAllVersionHashes } from './traverse-versions';

/**
 * traversing the snaps history is not cheap, so we first try to avoid it and if not possible,
 * traverse by the local head, if it finds the remote head, no need to traverse by the remote
 * head. (it also means that we can do fast-forward and no need for snap-merge).
 */
export async function getDivergeData(
  repo: Repository,
  modelComponent: ModelComponent,
  remoteHead: Ref | null,
  checkedOutLocalHead?: Ref | null, // in case locally on the workspace it has a different version
  throws = true // otherwise, save the error instance in the `DivergeData` object
): Promise<DivergeData> {
  const isOnLane = modelComponent.laneHeadLocal || modelComponent.laneHeadLocal === null;
  const localHead = checkedOutLocalHead || (isOnLane ? modelComponent.laneHeadLocal : modelComponent.getHead());
  if (!remoteHead) {
    if (localHead) {
      const allLocalHashes = await getAllVersionHashes(modelComponent, repo, false);
      return new DivergeData(allLocalHashes);
    }
    return new DivergeData();
  }
  if (!localHead) {
    const allRemoteHashes = await getAllVersionHashes(modelComponent, repo, false, remoteHead);
    return new DivergeData([], allRemoteHashes);
  }

  if (remoteHead.isEqual(localHead)) {
    // no diverge they're the same
    return new DivergeData();
  }

  const snapsOnLocal: Ref[] = [];
  const snapsOnRemote: Ref[] = [];
  let remoteHeadExistsLocally = false;
  let localHeadExistsRemotely = false;
  let commonSnapBeforeDiverge: Ref | undefined;
  let error: Error | undefined;
  const addParentsRecursively = async (version: Version, snaps: Ref[], isLocal: boolean) => {
    if (isLocal && version.hash().isEqual(remoteHead)) {
      remoteHeadExistsLocally = true;
      return;
    }
    if (!isLocal && version.hash().isEqual(localHead)) {
      localHeadExistsRemotely = true;
      return;
    }
    if (!isLocal && !commonSnapBeforeDiverge) {
      const snapExistLocally = snapsOnLocal.find((snap) => snap.isEqual(version.hash()));
      if (snapExistLocally) commonSnapBeforeDiverge = snapExistLocally;
    }
    snaps.push(version.hash());
    await Promise.all(
      version.parents.map(async (parent) => {
        const parentVersion = (await parent.load(repo)) as Version;
        if (parentVersion) {
          await addParentsRecursively(parentVersion, snaps, isLocal);
        } else {
          const err = new ParentNotFound(modelComponent.id(), version.hash().toString(), parent.toString());
          if (throws) throw err;
          error = err;
        }
      })
    );
  };
  const localVersion = (await repo.load(localHead)) as Version;
  if (!localVersion) {
    const err =
      new Error(`fatal: a component "${modelComponent.id()}" is missing the local head object (${localHead}) in the filesystem.
run the following command to fix it:
bit import ${modelComponent.id()} --objects`);
    if (throws) throw err;
    return new DivergeData(snapsOnLocal, [], remoteHead, err);
  }
  await addParentsRecursively(localVersion, snapsOnLocal, true);
  if (remoteHeadExistsLocally) {
    return new DivergeData(snapsOnLocal, [], remoteHead, error);
  }
  const remoteVersion = (await repo.load(remoteHead)) as Version;
  if (!remoteVersion) {
    const err = new VersionNotFoundOnFS(remoteHead.toString(), modelComponent.id());
    if (throws) throw err;
    return new DivergeData(snapsOnLocal, [], remoteHead, err);
  }
  await addParentsRecursively(remoteVersion, snapsOnRemote, false);
  if (localHeadExistsRemotely) {
    return new DivergeData([], snapsOnRemote, localHead, error);
  }

  if (!commonSnapBeforeDiverge) {
    const err = new NoCommonSnap(modelComponent.id());
    if (throws) throw err;
    return new DivergeData(snapsOnLocal, [], remoteHead, err);
  }
  return new DivergeData(
    R.difference(snapsOnLocal, snapsOnRemote),
    R.difference(snapsOnRemote, snapsOnLocal),
    commonSnapBeforeDiverge,
    error
  );
}
