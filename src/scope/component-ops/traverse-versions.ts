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
import { ModelComponent, Version } from '../models';
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
  const getRefToStartFrom = () => {
    if (typeof startFrom !== 'undefined') return startFrom;
    return modelComponent.getHeadRegardlessOfLane();
  };

  const laneHead = getRefToStartFrom();
  const headOnMain = modelComponent.getHead()?.toString();
  let foundOnMain = laneHead?.toString() === headOnMain;
  if (!laneHead) {
    return results;
  }
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

export type GetAllVersionHashesParams = {
  modelComponent: ModelComponent;
  repo: Repository;
  throws?: boolean; // in case objects are missing. by default, it's true
  versionObjects?: Version[];
  startFrom?: Ref | null; // by default, start from the head
  stopAt?: Ref[] | null; // by default, stop when the parents is empty
};

export async function getAllVersionHashes(options: GetAllVersionHashesParams): Promise<Ref[]> {
  const allVersionsInfo = await getAllVersionsInfo(options);
  return allVersionsInfo.map((v) => v.ref).filter((ref) => ref) as Ref[];
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
