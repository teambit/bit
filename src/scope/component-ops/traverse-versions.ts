/**
 * the snaps are saved as DAG (Direct Acyclic Graph).
 * each snap has `parents` prop.
 * when this is the first snap, the `parents` is empty.
 * the followed snap has the first snap as a parent.
 * in case of a merge between lanes, the `parents` have two snaps from the two lanes.
 *
 * traverse all versions is not cheap. it must load the Version object to extract the `parents`
 * data. so, we plan to cache it. once this is cached, we'll change the implementation of a few
 * methods here.
 */

import memoize from 'memoizee';
import pMapSeries from 'p-map-series';
import { HeadNotFound, ParentNotFound, VersionNotFound } from '../exceptions';
import type { ModelComponent, Version } from '../models';
import type { VersionParents } from '../models/version-history';
import { Ref, Repository } from '../objects';

export type VersionInfo = {
  ref: Ref;
  tag?: string;
  version?: Version;
  error?: Error;
  /**
   * can be 'false' when retrieved from the tags data on the component-object and the Version is
   * not legacy. It can happen when running "bit import" on a diverge component and before the
   * merge. the component itself is merged, but the head wasn't changed.
   */
  isPartOfHistory?: boolean;
  parents: Ref[];
  onLane: boolean;
};

/**
 * by default it starts the traverse from the head or lane-head, unless "startFrom" is passed.
 * if versionObjects passed, use it instead of loading from the repo.
 */
export async function getAllVersionsInfo({
  modelComponent,
  repo,
  throws = true,
  versionObjects,
  startFrom,
  stopAt,
}: {
  modelComponent: ModelComponent;
  repo?: Repository;
  throws?: boolean; // in case objects are missing
  versionObjects?: Version[];
  startFrom?: Ref | null; // by default, start from the head
  stopAt?: Ref[] | null; // by default, stop when the parents is empty
}): Promise<VersionInfo[]> {
  const results: VersionInfo[] = [];
  const isAlreadyProcessed = (ref: Ref): boolean => {
    return Boolean(results.find((result) => result.ref.isEqual(ref)));
  };
  const getVersionObj = async (ref: Ref): Promise<Version | undefined> => {
    if (!versionObjects && !repo) {
      throw new TypeError('getAllVersionsInfo expect to get either repo or versionObjects');
    }
    const foundInVersionObjects = versionObjects?.find((v) => v.hash().isEqual(ref));
    if (foundInVersionObjects) return foundInVersionObjects;
    if (repo) return (await ref.load(repo)) as Version;
    return undefined;
  };
  const laneHead = getRefToStartFrom(modelComponent, startFrom);
  if (!laneHead) {
    return results;
  }
  const headOnMain = modelComponent.getHead()?.toString();
  let foundOnMain = laneHead.toString() === headOnMain;

  const headInfo: VersionInfo = {
    ref: laneHead,
    tag: modelComponent.getTagOfRefIfExists(laneHead),
    parents: [],
    onLane: !foundOnMain,
  };
  const shouldStop = (ref: Ref): boolean => Boolean(stopAt?.find((r) => r.isEqual(ref)));
  const head = await getVersionObj(laneHead);
  if (head) {
    if (shouldStop(head.hash())) {
      return [];
    }
    headInfo.version = head;
    headInfo.parents = head.parents;
  } else {
    headInfo.error = new HeadNotFound(modelComponent.id(), laneHead.toString());
    if (throws) throw headInfo.error;
  }
  results.push(headInfo);
  const addParentsRecursively = async (version: Version) => {
    await pMapSeries(version.parents, async (parent) => {
      if (shouldStop(parent)) {
        return;
      }
      if (isAlreadyProcessed(parent)) {
        // happens when there are two parents at some point, and then they merged
        return;
      }
      const parentVersion = await getVersionObj(parent);
      if (!foundOnMain) foundOnMain = parentVersion?._hash === headOnMain;
      const versionInfo: VersionInfo = {
        ref: parent,
        tag: modelComponent.getTagOfRefIfExists(parent),
        isPartOfHistory: true,
        parents: parentVersion?.parents || [],
        onLane: !foundOnMain,
      };
      if (parentVersion) {
        versionInfo.version = parentVersion;
      } else {
        versionInfo.error = versionInfo.tag
          ? new VersionNotFound(versionInfo.tag, modelComponent.id())
          : new ParentNotFound(modelComponent.id(), version.hash().toString(), parent.toString());
        if (throws) throw versionInfo.error;
      }
      results.push(versionInfo);
      if (parentVersion) await addParentsRecursively(parentVersion);
    });
  };
  if (head) await addParentsRecursively(head);
  return results;
}

function getRefToStartFrom(modelComponent: ModelComponent, startFrom?: null | Ref) {
  if (typeof startFrom !== 'undefined') return startFrom;
  return modelComponent.getHeadRegardlessOfLane();
}

export type GetAllVersionHashesParams = {
  modelComponent: ModelComponent;
  repo: Repository;
  throws?: boolean; // in case objects are missing. by default, it's true
  versionObjects?: Version[];
  startFrom?: Ref | null; // by default, start from the head
  stopAt?: Ref[]; // by default, stop when the parents is empty
};

export async function getAllVersionHashes(options: GetAllVersionHashesParams): Promise<Ref[]> {
  const { repo, modelComponent, throws, versionObjects, startFrom, stopAt } = options;
  const head = getRefToStartFrom(modelComponent, startFrom);
  if (!head) {
    return [];
  }
  const versionParents = await getAllVersionParents({ repo, modelComponent, throws, versionObjects, head });
  const subsetOfVersionParents = getSubsetOfVersionParents(versionParents, head, stopAt);
  return subsetOfVersionParents.map((s) => s.hash);
}

export const getAllVersionHashesMemoized = memoize(getAllVersionHashes, {
  normalizer: (args) => JSON.stringify(args[0]),
  promise: true,
  maxAge: 1, // 1ms is good. it's only for consecutive calls while this function is still in process. we don't want to cache the results.
});

export async function hasVersionByRef(
  modelComponent: ModelComponent,
  ref: Ref,
  repo: Repository,
  startFrom?: Ref | null
): Promise<boolean> {
  const allVersionHashes = await getAllVersionHashes({ modelComponent, repo, startFrom });
  return allVersionHashes.some((hash) => hash.isEqual(ref));
}

export async function getAllVersionParents({
  repo,
  modelComponent,
  head,
  throws,
  versionObjects, // relevant for remote-scope where during export the data is not in the repo yet.
}: {
  repo: Repository;
  modelComponent: ModelComponent;
  head: Ref;
  throws?: boolean;
  versionObjects?: Version[];
}): Promise<VersionParents[]> {
  const versionHistory = await modelComponent.GetVersionHistory(repo);
  const { err, added } = await modelComponent.populateVersionHistoryIfMissingGracefully(repo, versionHistory, head);
  const versionParents: VersionParents[] = [];
  if (err) {
    if (throws) {
      // keep also the current stack. otherwise, the stack will have the recursive traversal data, which won't help much.
      const newErr = new Error(err.message);
      err.stack = `${err.stack}\nCurrent stack ${newErr.stack}`;
      throw err;
    }
    if (added) versionParents.push(...added);
  } else {
    versionParents.push(...versionHistory.versions);
  }
  if (versionObjects) {
    const versionParentsFromObjects = versionObjects.map((v) => getVersionParentsFromVersion(v));
    versionParentsFromObjects.forEach((versionParentItem) => {
      const existing = versionParents.find((v) => v.hash.isEqual(versionParentItem.hash));
      if (!existing) versionParents.push(versionParentItem);
      else {
        // override it
        Object.keys(existing).forEach((field) => (existing[field] = versionParentItem[field]));
      }
    });
  }
  return versionParents;
}

function getSubsetOfVersionParents(versionParents: VersionParents[], from: Ref, stopAt?: Ref[]): VersionParents[] {
  const results: VersionParents[] = [];
  const shouldStop = (ref: Ref): boolean => Boolean(stopAt?.find((r) => r.isEqual(ref)));
  const getVersionParent = (ref: Ref) => versionParents.find((v) => v.hash.isEqual(ref));
  const isAlreadyProcessed = (ref: Ref): boolean => {
    return Boolean(results.find((result) => result.hash.isEqual(ref)));
  };
  const addVersionParentRecursively = (version: VersionParents) => {
    results.push(version);
    version.parents.forEach((parent) => {
      if (shouldStop(parent)) {
        return;
      }
      if (isAlreadyProcessed(parent)) {
        // happens when there are two parents at some point, and then they merged
        return;
      }
      const parentVersion = getVersionParent(parent);

      if (parentVersion) addVersionParentRecursively(parentVersion);
    });
  };
  const head = getVersionParent(from);
  if (!head) return [];
  addVersionParentRecursively(head);
  return results;
}

export function getVersionParentsFromVersion(version: Version): VersionParents {
  return {
    hash: version.hash(),
    parents: version.parents,
    unrelated: version.unrelated?.head,
    squashed: version.squashed?.previousParents,
  };
}
