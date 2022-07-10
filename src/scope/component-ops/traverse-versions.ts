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
  stopAt?: Ref | null; // by default, stop when the parents is empty
}): Promise<VersionInfo[]> {
  const results: VersionInfo[] = [];
  const getVersionObj = async (ref: Ref): Promise<Version | undefined> => {
    if (versionObjects) return versionObjects.find((v) => v.hash().isEqual(ref));
    if (repo) return (await ref.load(repo)) as Version;
    throw new TypeError('getAllVersionsInfo expect to get either repo or versionObjects');
  };
  const getRefToStartFrom = () => {
    if (typeof startFrom !== 'undefined') return startFrom;
    return modelComponent.getHeadRegardlessOfLane();
  };

  const laneHead = getRefToStartFrom();
  let stopped = false;
  const headOnMain = modelComponent.getHead()?.toString();
  let foundOnMain = laneHead?.toString() === headOnMain;
  if (laneHead) {
    const headInfo: VersionInfo = {
      ref: laneHead,
      tag: modelComponent.getTagOfRefIfExists(laneHead),
      parents: [],
      onLane: !foundOnMain,
    };
    const head = await getVersionObj(laneHead);
    if (head) {
      if (stopAt && stopAt.isEqual(head.hash())) {
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
      await Promise.all(
        version.parents.map(async (parent) => {
          if (stopAt && stopAt.isEqual(parent)) {
            stopped = true;
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
        })
      );
    };
    if (head) await addParentsRecursively(head);
  }
  // @todo: make sure the "stopped" is working. seems like it doesn't do anything now.
  // previously, this function was longer and continued traversing all tags to find legacy Version objects that didn't
  // have parents.
  if (stopped) return results;
  return results;
}

export async function getAllVersionsObjects(
  modelComponent: ModelComponent,
  repo: Repository,
  throws = true
): Promise<Version[]> {
  const allVersionsInfo = await getAllVersionsInfo({ modelComponent, repo, throws });
  return allVersionsInfo.map((a) => a.version).filter((a) => a) as Version[];
}

export async function getAllVersionHashesByVersionsObjects(
  modelComponent: ModelComponent,
  versionObjects: Version[],
  throws = true
): Promise<Ref[]> {
  const allVersionsInfo = await getAllVersionsInfo({ modelComponent, throws, versionObjects });
  return allVersionsInfo.map((v) => v.ref).filter((ref) => ref) as Ref[];
}

export async function getAllVersionHashes(
  modelComponent: ModelComponent,
  repo: Repository,
  throws = true,
  startFrom?: Ref | null,
  stopAt?: Ref | null
): Promise<Ref[]> {
  const allVersionsInfo = await getAllVersionsInfo({ modelComponent, repo, throws, startFrom, stopAt });
  return allVersionsInfo.map((v) => v.ref).filter((ref) => ref) as Ref[];
}

export async function hasVersionByRef(
  modelComponent: ModelComponent,
  ref: Ref,
  repo: Repository,
  startFrom?: Ref | null
): Promise<boolean> {
  const allVersionHashes = await getAllVersionHashes(modelComponent, repo, true, startFrom);
  return allVersionHashes.some((hash) => hash.isEqual(ref));
}
