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

import { Repository, Ref } from '../objects';
import { Version, ModelComponent } from '../models';
import { VersionNotFound, HeadNotFound, ParentNotFound } from '../exceptions';

type VersionInfo = { ref: Ref; tag?: string; version?: Version; error?: Error };

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
}: {
  modelComponent: ModelComponent;
  repo?: Repository;
  throws?: boolean;
  versionObjects?: Version[];
  startFrom?: Ref | null;
}): Promise<VersionInfo[]> {
  const results: VersionInfo[] = [];
  const getVersionObj = async (ref: Ref): Promise<Version | undefined> => {
    if (versionObjects) return versionObjects.find((v) => v.hash().isEqual(ref));
    if (repo) return (await ref.load(repo)) as Version;
    throw new TypeError('getAllVersionsInfo expect to get either repo or versionObjects');
  };
  const getRefToStartFrom = () => {
    if (typeof startFrom !== 'undefined') return startFrom;
    return modelComponent.laneHeadLocal || modelComponent.getHead();
  };
  const laneHead = getRefToStartFrom();
  if (laneHead) {
    const headInfo: VersionInfo = { ref: laneHead, tag: modelComponent.getTagOfRefIfExists(laneHead) };
    const head = await getVersionObj(laneHead);
    if (head) {
      headInfo.version = head;
    } else {
      headInfo.error = new HeadNotFound(modelComponent.id(), laneHead.toString());
      if (throws) throw headInfo.error;
    }
    results.push(headInfo);

    const addParentsRecursively = async (version: Version) => {
      await Promise.all(
        version.parents.map(async (parent) => {
          const parentVersion = await getVersionObj(parent);
          const versionInfo: VersionInfo = { ref: parent, tag: modelComponent.getTagOfRefIfExists(parent) };
          if (parentVersion) {
            versionInfo.version = parentVersion;
            await addParentsRecursively(parentVersion);
          } else {
            versionInfo.error = versionInfo.tag
              ? new VersionNotFound(versionInfo.tag)
              : new ParentNotFound(modelComponent.id(), version.hash().toString(), parent.toString());
            if (throws) throw versionInfo.error;
          }
          results.push(versionInfo);
        })
      );
    };
    if (head) await addParentsRecursively(head);
  }
  // backward compatibility.
  // components created before v15, might not have head.
  // even if they do have head (as a result of tag/snap after v15), they
  // have old versions without parents and new versions with parents
  await Promise.all(
    Object.keys(modelComponent.versions).map(async (version) => {
      if (!results.find((r) => r.tag === version)) {
        const ref = modelComponent.versions[version];
        const versionObj = await getVersionObj(ref);
        const versionInfo: VersionInfo = { ref, tag: version };
        if (versionObj) versionInfo.version = versionObj;
        else {
          versionInfo.error = new VersionNotFound(version);
          if (throws) throw versionInfo.error;
        }
        results.push(versionInfo);
      }
    })
  );

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
  startFrom?: Ref | null
): Promise<Ref[]> {
  const allVersionsInfo = await getAllVersionsInfo({ modelComponent, repo, throws, startFrom });
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
