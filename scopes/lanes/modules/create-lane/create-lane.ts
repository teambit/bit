import { BitError } from '@teambit/bit-error';
import type { LaneId } from '@teambit/lane-id';
import type { Consumer } from '@teambit/legacy.consumer';
import type { ScopeMain } from '@teambit/scope';
// import { ComponentIdList } from '@teambit/component-id';
import type { LaneComponent } from '@teambit/objects';
import { Ref, Lane } from '@teambit/objects';
import { isSnap } from '@teambit/component-version';
import { ComponentsList } from '@teambit/legacy.component-list';
import type { Workspace } from '@teambit/workspace';
import { compact } from 'lodash';
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
  await throwForStagedComponents(workspace);
  const getDataToPopulateLaneObjectIfNeeded = async (): Promise<LaneComponent[]> => {
    if (remoteLane) return remoteLane.components;
    // when branching from one lane to another, copy components from the origin lane
    // when branching from main, no need to copy anything
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
