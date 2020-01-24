import R from 'ramda';
import { Repository, Ref } from '../objects';
import { ModelComponent, Version } from '../models';
import { ParentNotFound } from '../exceptions';
import { DivergeData } from './diverge-data';

/**
 * traversing the snaps history is not cheap, so we first try to avoid it and if not possible,
 * traverse by the local head, if it finds the remote head, no need to traverse by the remote
 * head. (it also means that we can do do fast-forward and no need for snap-merge).
 */
export async function getDivergeData(
  repo: Repository,
  modelComponent: ModelComponent,
  remoteHead: Ref | null,
  throws = true
): Promise<DivergeData> {
  const localHead = modelComponent.laneHeadLocal || modelComponent.getSnapHead();
  if (!remoteHead) {
    if (localHead) {
      const allVersions = await modelComponent.getAllVersionsInfo({ repo });
      const allLocalHashes = allVersions.map(v => v.ref);
      return new DivergeData(allLocalHashes);
    }
    return new DivergeData();
  }
  if (!localHead) {
    // @todo: this is happening when there a remote head and no local head, not sure this state
    // is even possible, maybe it is when fetching a remote before merging locally?
    return new DivergeData();
  }

  if (remoteHead.isEqual(localHead)) {
    // no diverge they're the same
    return new DivergeData();
  }

  const snapsOnLocal: Ref[] = [];
  const snapsOnRemote: Ref[] = [];
  let remoteHeadExistsLocally = false;
  let localHeadExistsRemotely = false;
  let commonSnapBeforeDiverge: Ref;
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
      const snapExistLocally = snapsOnLocal.find(snap => snap.isEqual(version.hash()));
      if (snapExistLocally) commonSnapBeforeDiverge = snapExistLocally;
    }
    snaps.push(version.hash());
    await Promise.all(
      version.parents.map(async parent => {
        const parentVersion = (await parent.load(repo)) as Version;
        if (parentVersion) {
          await addParentsRecursively(parentVersion, snaps, isLocal);
        } else if (throws) {
          throw new ParentNotFound(modelComponent.id(), version.hash().toString(), parent.toString());
        }
      })
    );
  };
  const localVersion = (await repo.load(localHead)) as Version;
  await addParentsRecursively(localVersion, snapsOnLocal, true);
  if (remoteHeadExistsLocally) {
    return new DivergeData(snapsOnLocal, [], remoteHead);
  }
  const remoteVersion = (await repo.load(remoteHead)) as Version;
  await addParentsRecursively(remoteVersion, snapsOnRemote, false);
  if (localHeadExistsRemotely) {
    return new DivergeData([], snapsOnRemote, localHead);
  }

  // @ts-ignore
  if (!commonSnapBeforeDiverge)
    throw new Error(
      `fatal: local and remote of ${modelComponent.id()} could not possibly diverged as they don't have any snap in common`
    );
  return new DivergeData(
    R.difference(snapsOnLocal, snapsOnRemote),
    R.difference(snapsOnRemote, snapsOnLocal),
    commonSnapBeforeDiverge
  );
}
