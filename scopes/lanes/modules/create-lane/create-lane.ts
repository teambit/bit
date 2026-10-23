import { BitError } from '@teambit/bit-error';
import type { LaneId } from '@teambit/lane-id';
import type { Consumer } from '@teambit/legacy.consumer';
import type { ScopeMain } from '@teambit/scope';
// import { ComponentIdList } from '@teambit/component-id';
import type { BitObject, LaneComponent, ModelComponent } from '@teambit/objects';
import { Ref, Lane } from '@teambit/objects';
import { isSnap } from '@teambit/component-version';
import { ComponentsList } from '@teambit/legacy.component-list';
import type { Workspace } from '@teambit/workspace';
import { compact } from 'lodash';
import pMapSeries from 'p-map-series';
import { getBitCloudUser } from '@teambit/cloud.modules.get-cloud-user';
import { InvalidScopeName, isValidScopeName } from '@teambit/legacy-bit-id';

const MAX_LANE_NAME_LENGTH = 800;

export async function createLane(
  workspace: Workspace,
  laneName: string,
  scopeName: string,
  remoteLane?: Lane
): Promise<Lane> {
  const consumer = workspace.consumer;
  const lanes = await consumer.scope.listLanes();
  if (lanes.find((lane) => lane.name === laneName && lane.scope === scopeName)) {
    throw new BitError(
      `lane "${scopeName}/${laneName}" already exists, to switch to this lane, please use "bit switch" command`
    );
  }
  const bitCloudUser = await getBitCloudUser();
  throwForInvalidLaneName(laneName);
  if (!isValidScopeName(scopeName)) {
    throw new InvalidScopeName(scopeName);
  }
  const getDataToPopulateLaneObjectIfNeeded = async (): Promise<LaneComponent[]> => {
    if (remoteLane) return remoteLane.components;
    // when branching from one lane to another, copy components from the origin lane
    // when branching from main, the staged snaps of main are moved to the lane (see moveStagedSnapsOfMainToLane)
    const currentLaneObject = await consumer.getCurrentLaneObject();
    if (!currentLaneObject) return [];
    const laneComponents = currentLaneObject.components;
    const workspaceIds = consumer.bitMap.getAllBitIds();
    const laneComponentWithBitmapHead = await Promise.all(
      laneComponents.map(async ({ id, head }) => {
        const compId = id.changeVersion(head.toString());
        const isRemoved = await workspace.scope.isComponentRemoved(compId);
        if (isRemoved) return null;
        const bitmapHead = workspaceIds.searchWithoutVersion(id);
        if (bitmapHead && isSnap(bitmapHead.version)) {
          return { id, head: Ref.from(bitmapHead.version as string) };
        }
        return { id, head };
      })
    );
    return compact(laneComponentWithBitmapHead);
  };

  const forkedFrom = await getLaneOrigin(consumer);
  const newLane = remoteLane
    ? Lane.from({
        name: laneName,
        hash: remoteLane.hash().toString(),
        log: remoteLane.log,
        scope: remoteLane.scope,
        forkedFrom,
      })
    : Lane.create(laneName, scopeName, forkedFrom, bitCloudUser);
  const dataToPopulate = await getDataToPopulateLaneObjectIfNeeded();
  newLane.setLaneComponents(dataToPopulate);
  if (!remoteLane && workspace.isOnMain()) await moveStagedSnapsOfMainToLane(workspace, newLane);

  const laneHistoryMsg = remoteLane ? `fork lane "${remoteLane.name}"` : 'new lane';
  await consumer.scope.lanes.saveLane(newLane, { laneHistoryMsg });

  return newLane;
}

export async function createLaneInScope(laneName: string, scope: ScopeMain, scopeName = scope.name): Promise<Lane> {
  const lanes = await scope.legacyScope.listLanes();
  if (lanes.find((lane) => lane.name === laneName)) {
    throw new BitError(`lane "${laneName}" already exists`);
  }
  throwForInvalidLaneName(laneName);
  const newLane = Lane.create(laneName, scopeName);
  await scope.legacyScope.lanes.saveLane(newLane, { laneHistoryMsg: 'new lane (created from scope)' });
  return newLane;
}

/**
 * snaps that exist on main locally but were not exported (e.g. snapped on main by mistake, or after merging another
 * lane into main locally) are moved to the new lane: the lane gets them as heads, and main goes back to its remote head.
 * otherwise, the same snaps are staged on both main and the lane, and once switching to main, it's impossible to switch
 * back to the lane without exporting them to main directly.
 * the snaps that were made on main become snaps of the lane. it's safe to change them because they were never exported.
 */
async function moveStagedSnapsOfMainToLane(workspace: Workspace, lane: Lane) {
  const repo = workspace.consumer.scope.objects;
  const workspaceIds = workspace.consumer.bitMap.getAllBitIds();
  const modelComponents = await new ComponentsList(workspace).getModelComponents();
  const toMove: Array<{ modelComponent: ModelComponent; head: Ref; localRefs: Ref[] }> = [];
  const errors: string[] = [];
  await pMapSeries(modelComponents, async (modelComponent) => {
    const bitmapId = workspaceIds.searchWithoutVersion(modelComponent.toComponentId());
    const head = modelComponent.head;
    if (!bitmapId || !head || modelComponent.remoteHead?.isEqual(head)) return;
    // diverge from the main head, not from the .bitmap version, to find also local snaps the workspace is not on
    await modelComponent.setDivergeData(repo, undefined, false);
    const localRefs = await modelComponent.getLocalHashes(repo);
    if (!localRefs.length) return;
    const tags = compact(localRefs.map((ref) => modelComponent.getTagOfRefIfExists(ref)));
    if (tags.length) {
      errors.push(`${bitmapId.toStringWithoutVersion()} - has tags that were not exported (${tags.join(', ')})`);
    } else if (bitmapId.version !== head.toString()) {
      errors.push(
        `${bitmapId.toStringWithoutVersion()} - the workspace is on ${bitmapId.version}, not on the main head ${head.toString()}. run "bit checkout head" to fix it`
      );
    } else {
      toMove.push({ modelComponent, head, localRefs });
    }
  });
  if (errors.length) {
    throw new BitError(`unable to create a lane, the following components have snaps or tags on main that were not exported and can't be moved to the new lane.
export or reset them first (see "bit status"), or fix as suggested:
${errors.join('\n')}`);
  }
  const laneOrigin = { scope: lane.scope, name: lane.name, hash: lane.hash().toString() };
  const objectsToWrite: BitObject[] = [];
  await pMapSeries(toMove, async ({ modelComponent, head, localRefs }) => {
    const versions = await Promise.all(localRefs.map((ref) => modelComponent.loadVersion(ref.toString(), repo)));
    // snaps of another lane (e.g. merged into main locally) were exported already, keep them as is.
    versions
      .filter((version) => !version.origin?.lane)
      .forEach((version) => {
        const id = version.origin?.id || { scope: modelComponent.scope as string, name: modelComponent.name };
        version.origin = { id, lane: laneOrigin };
        objectsToWrite.push(version);
      });
    localRefs.forEach((ref) => modelComponent.removeVersion(ref.toString()));
    modelComponent.setHead(modelComponent.remoteHead || undefined);
    objectsToWrite.push(modelComponent);
    lane.addComponent({ id: modelComponent.toComponentId(), head });
  });
  await repo.writeObjectsToTheFS(objectsToWrite);
}

async function getLaneOrigin(consumer: Consumer): Promise<LaneId | undefined> {
  const currentLaneId = consumer.bitMap.laneId;
  if (!currentLaneId) return undefined;
  if (consumer.bitMap.isLaneExported) {
    return currentLaneId;
  }
  // current lane is new.
  const currentLane = await consumer.getCurrentLaneObject();
  return currentLane?.forkedFrom;
}

export function throwForInvalidLaneName(laneName: string) {
  if (!isValidLaneName(laneName)) {
    throw new BitError(
      `lane "${laneName}" has invalid characters. lane name can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]`
    );
  }
}

export async function throwForStagedComponents(workspace: Workspace) {
  const componentList = new ComponentsList(workspace);
  const stagedComponents = await componentList.listExportPendingComponentsIds();
  if (stagedComponents.length) {
    throw new BitError(
      `unable to switch/create a new lane, please export or reset the following components first: ${stagedComponents.join(
        ', '
      )}`
    );
  }
}

function isValidLaneName(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  if (val.length > MAX_LANE_NAME_LENGTH) return false;
  // @todo: should we allow slash? if so, we should probably replace the lane-delimiter with something else. (maybe ":")
  return /^[$\-_!a-z0-9]+$/.test(val);
}
