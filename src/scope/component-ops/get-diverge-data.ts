import { difference } from 'lodash';
import { Graph } from '@teambit/graph.cleargraph';
import { VersionNotFoundOnFS } from '../exceptions';
import { NoCommonSnap } from '../exceptions/no-common-snap';
import { ModelComponent } from '../models';
import { VersionParents, versionParentsToGraph } from '../models/version-history';
import { Ref, Repository } from '../objects';
import { SnapsDistance } from './snaps-distance';
import { getAllVersionHashes, getAllVersionParents } from './traverse-versions';

/**
 * *** NEW WAY ***
 * 1. build a graph with everything.
 * 2. get the subgraph of the source and subgraph of the target - filter edges by parents only.
 * this subgraphs will be used to diff the snaps and find which are only in the source and which are only in the target.
 * 3. if there are common snaps, no need for the squashed and unrelated.
 * 4. if there are no common snaps, get the subgraphs of both with the squashed and unrelated.
 * 5. get the array of the common snaps. (either by #3 or #4).
 * 6. traverse via BFS of either the source or the target (doesn't matter which one) and find the first node
 * which is also in the common snaps array. this is the common snap before the diverge.
 * BFS is more efficient than DFS for this usage because normally the common snap is not far from the source.
 *
 * *** OLD WAY - NOT USED ANYMORE ***
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
  throwForNoCommonSnap = false, // by default, save the error in `SnapsDistance` obj.
  versionParentsFromObjects, // relevant for remote-scope where during export the data is not in the repo yet.
}: {
  repo: Repository;
  modelComponent: ModelComponent;
  sourceHead?: Ref | null;
  targetHead: Ref | null;
  throws?: boolean;
  throwForNoCommonSnap?: boolean;
  versionParentsFromObjects?: VersionParents[];
}): Promise<SnapsDistance> {
  const isOnLane = modelComponent.laneHeadLocal || modelComponent.laneHeadLocal === null;
  const localHead = sourceHead || (isOnLane ? modelComponent.laneHeadLocal : modelComponent.getHead());
  // uncomment the following line to debug diverge-data issues.
  // if (modelComponent.name === 'x') console.log('getDivergeData, localHead', localHead, 'targetHead', targetHead);
  if (!targetHead) {
    if (localHead) {
      const allLocalHashes = await getAllVersionHashes({
        modelComponent,
        repo,
        throws: false,
        versionParentsFromObjects,
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
      versionParentsFromObjects,
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
    versionParentsFromObjects,
  });

  const getVersionData = (ref: Ref): VersionParents | undefined => versionParents.find((v) => v.hash.isEqual(ref));

  let error: Error | undefined;

  const graph = versionParentsToGraph(versionParents);
  let sourceSubgraph = graph.successorsSubgraph(localHead.toString(), { edgeFilter: (e) => e.attr === 'parent' });
  let targetSubgraph = graph.successorsSubgraph(targetHead.toString(), { edgeFilter: (e) => e.attr === 'parent' });
  let sourceArr = sourceSubgraph.nodes.map((n) => n.id);
  let targetArr = targetSubgraph.nodes.map((n) => n.id);
  let commonSnaps = sourceArr.filter((snap) => targetArr.includes(snap));

  if (!commonSnaps.length) {
    sourceSubgraph = graph.successorsSubgraph(localHead.toString());
    targetSubgraph = graph.successorsSubgraph(targetHead.toString());
    const sourceFullArr = sourceSubgraph.nodes.map((n) => n.id);
    const targetFullArr = targetSubgraph.nodes.map((n) => n.id);
    commonSnaps = sourceFullArr.filter((snap) => targetFullArr.includes(snap));
    if (commonSnaps.length) {
      // these commonSnaps are not from "parents", they're either squashed or unrelated. remove them from the arrays.
      sourceArr = sourceArr.filter((snap) => !commonSnaps.includes(snap));
      targetArr = targetArr.filter((snap) => !commonSnaps.includes(snap));
    }
  }

  let closestCommonSnap: string | undefined;
  if (commonSnaps.length) {
    // find the closest common snap by traversing the source subgraph BFS
    const stopFn = (n: string) => commonSnaps.includes(n);
    closestCommonSnap = traverseBFS(sourceSubgraph, localHead.toString(), stopFn);
    if (!closestCommonSnap) throw new Error('getDivergeData, traverseBFS was unable to find the closest common snap');
  }

  const snapsOnSourceOnly = difference(sourceArr, targetArr).map((snap) => Ref.from(snap));
  const snapsOnTargetOnly = difference(targetArr, sourceArr).map((snap) => Ref.from(snap));

  const localVersion = getVersionData(localHead);
  if (!localVersion) {
    const err =
      new Error(`fatal: a component "${modelComponent.id()}" is missing the local head object (${localHead}) in the filesystem.
run the following command to fix it:
bit import ${modelComponent.id()} --objects`);
    if (throws) throw err;
    return new SnapsDistance(snapsOnSourceOnly, [], targetHead, err);
  }

  const targetVersion = getVersionData(targetHead);
  if (!targetVersion) {
    const err = new VersionNotFoundOnFS(targetHead.toString(), modelComponent.id());
    if (throws) throw err;
    return new SnapsDistance([], [], undefined, err);
  }

  const commonSnapBeforeDiverge = closestCommonSnap ? Ref.from(closestCommonSnap) : undefined;
  if (!commonSnapBeforeDiverge) {
    const unmergedData = repo.unmergedComponents.getEntry(modelComponent.name);
    const isUnrelatedFromUnmerged = unmergedData?.unrelated && unmergedData.head.isEqual(localHead);
    const isUnrelatedFromVersionObj = localVersion.unrelated?.isEqual(targetHead);
    if (isUnrelatedFromUnmerged || isUnrelatedFromVersionObj) {
      return new SnapsDistance(snapsOnSourceOnly, snapsOnTargetOnly, undefined);
    }
    const err = new NoCommonSnap(modelComponent.id());
    if (throwForNoCommonSnap) throw err;
    return new SnapsDistance(snapsOnSourceOnly, snapsOnTargetOnly, undefined, err);
  }

  return new SnapsDistance(snapsOnSourceOnly, snapsOnTargetOnly, commonSnapBeforeDiverge, error);
}

/**
 * traverse the graph via BFS to find the first node which is also in the common snaps array.
 */
function traverseBFS(graph: Graph<string, string>, start: string, stopFn: (n: string) => boolean): string | undefined {
  const queue = [start];
  const visited = {};
  while (queue.length) {
    const current = queue.shift();
    if (!current) throw new Error('traverseBFS, queue is empty');
    // eslint-disable-next-line no-continue
    if (visited[current]) continue;
    visited[current] = true;
    if (stopFn(current)) {
      return current;
    }
    const successors = graph.outEdges(current).map((e) => e.targetId);
    queue.push(...successors);
  }
  return undefined;
}
